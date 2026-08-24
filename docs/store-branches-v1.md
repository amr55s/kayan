# Store branches v1

DAIRTAK v1 uses multiple fulfillment branches with inventory shared at the
store level. `inventory_stock` remains keyed by product variant; stock is not
allocated or promised per branch in this version.

At checkout the database, not the browser, chooses an eligible active branch.
The deterministic order is:

1. Default branch first.
2. Lowest branch `sort_order`.
3. Lowest branch UUID as the final stable tie-breaker.

The checkout transaction locks the cart and all participating stores in a
consistent order before reading delivery configuration. The inserted child
order stores both `branch_id` and an immutable `branch_snapshot`, including the
address, selected zone and mode, fee, SLA, and the `store` inventory scope.

`store_delivery_zones` remains the compatibility surface for checkout preview
and older integrations. Branch configuration writes recompute that surface
from the branch that the checkout selector would choose. The legacy store-wide
delivery RPC writes to the default branch and then recomputes the same surface.

Branch records are deactivated rather than physically deleted. The default
branch must stay active, and historical orders retain their foreign key and
snapshot even after a non-default branch is deactivated.
