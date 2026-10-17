# Migration from 1.2

Deployments created before 1.2 stored a `recovery` alias alongside the
primary entries. Rotation only rewrites live entries, so the alias is
resolved from the compatibility table in `src/store.js` instead of the
store itself. Remove the table once no deployment reports 1.2 metadata.
