# Card fonts

`DairtakCard-400.ttf` and `DairtakCard-700.ttf` are used only by
`app/api/marketing-card` to draw Arabic and Latin text on share cards. The
serverless runtime has no Arabic system font, so the route loads these files
explicitly.

They are the Arabic and Latin subsets of IBM Plex Sans Arabic (from
`@fontsource/ibm-plex-sans-arabic`) merged into one file per weight and renamed
"Dairtak Card", as the SIL Open Font License requires for modified versions.
License: `OFL.txt`.
