import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

test('SQL nullability adapter widens only reviewed RPC parameters and keeps generated argument checks', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const file = resolve(root, '__chat_rpc_nullability_contract__.ts');
  const source = `
    import { chatRpcArgs } from './lib/commerce/chat/service';
    chatRpcArgs('open_my_marketplace_conversation', { p_store_id: null, p_order_id: 'order', p_kind: 'order' });
    chatRpcArgs('set_my_marketplace_chat_preferences', { p_thread_id: 'thread', p_muted_until: null });
    chatRpcArgs('get_marketplace_chat_as_monitor', { p_thread_id: 'thread', p_monitor_session_id: null });
    // @ts-expect-error NULL is not permitted for the required authenticated resource ID.
    chatRpcArgs('set_my_marketplace_chat_preferences', { p_thread_id: null, p_muted_until: null });
    // @ts-expect-error Unknown parameters still fail generated argument validation.
    chatRpcArgs('get_marketplace_chat_as_monitor', { p_thread_id: 'thread', p_actor_id: 'forged' });
    // @ts-expect-error The helper cannot cast an arbitrary RPC contract.
    chatRpcArgs('approve_account_request', { p_request_id: null });
  `;
  const configFile = ts.readConfigFile(resolve(root, 'tsconfig.json'), ts.sys.readFile);
  const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
  const options = { ...config.options, noEmit: true, incremental: false };
  const host = ts.createCompilerHost(options);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (filename, ...args) => resolve(filename) === file
    ? ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true)
    : originalGetSourceFile(filename, ...args);
  const program = ts.createProgram([file], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.deepEqual(diagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')), []);
});
