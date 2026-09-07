# In-seat gate list — the commands a wave must pass before anything is called shipped
# orbit-for-claude
npm run check
npm test
npm run evals
npm run verify:counts
npm run pack
# get-orbit (Node 24 via nvm for test:unit)
npx tsc --noEmit -p tsconfig.json
npm run test:unit
npm run verify:admin
