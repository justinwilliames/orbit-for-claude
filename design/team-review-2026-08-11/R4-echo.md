> Personas are fictional cognitive frames — see pulsar-team SKILL.md §1. Nothing here is a statement by or about a real person.

# Echo — Round 4 growth/activation review

## What I checked

I went straight for the activation funnel: what does someone actually see between "I clicked download" and "I did something useful in Claude." Homepage → `/downloads` → the .mcpb → first prompt. That's the only moment that matters for a product with 2 unique repo visitors in 14 days — there is no second chance to make this land.

The good news first, because it's real: `/getting-started` (get-orbit `app/getting-started/page.tsx`) is genuinely well built. Five prompts, each matched to a real use case, each naming exactly which skill fires and what artifact comes out the other end, plus a troubleshooting section for the three most likely "it's not working" states. This is the best single onboarding asset in the whole site. It reads like someone who has watched a stranger get confused and fixed the confusion, not like a features list.

## The finding

**`/downloads` — the page every "Get Orbit MCP" button on the site points to, and the page the version-nag now correctly sends existing installs back to — never links to `/getting-started`.**

I read the full file (`get-orbit/app/downloads/page.tsx`, 105 lines). Its own header comment calls it "the canonical free install surface." The install steps it renders are:

```
1. Download the file above.
2. Double-click it. Claude Desktop installs the extension.
3. Restart Claude Desktop.
4. Ask Claude to run Orbit's render gate on an email, or to size an A/B test.
```

Step 4 is one generic line, hand-picked from two tools that need no credentials. It is not wrong, but it is the least-informed possible substitute for a page that already exists, one click away, with five prompts matched to actual jobs-to-be-done ("audit a lifecycle program," "design an onboarding flow," "fix Braze naming," "plan an IP warm-up," "build a production email end-to-end") plus what happens after you send each one.

I confirmed with `grep -rn "getting-started" app components lib` that `/getting-started` is linked from nav, footer, `/account/downloads` (the paid/account flow), `/apps`, and the chat install CTA — everywhere except the one page that is the actual first stop after every "Get Orbit MCP" click on the homepage. And the README's own "Try it in ninety seconds" section (which is what someone installing via the Claude Desktop extension directory reads, since they never touch the website at all) doesn't mention `/getting-started` either — so there are now two separate, non-overlapping post-install onboarding experiences, and the stronger one is orphaned from both entry points that would actually route a first-time user through it.

This matters more than usual right now because the version-nag (`server/version-nag.js`) was just fixed this round to actually fire, and it hands existing installs the same `/downloads` URL: `"Download the .mcpb from https://yourorbit.team/downloads and double-click it."` That's the one channel that reaches someone who already has Orbit — and it also dead-ends at the generic step 4 instead of the page built to convert a first click into a first real result.

**Fix:** replace step 4 on `/downloads` with a link into `/getting-started` ("Not sure what to ask first? Five starter prompts, matched to what you're trying to do →"), or fold the strongest 1–2 of the five prompts directly into the downloads page so the funnel doesn't require a second navigation to hit the good copy. Either is a one-file change.

## What I did not re-file

The homepage hero, the H1 ("A lifecycle marketer, built into Claude"), and the `OrbitDemo` component (`components/orbit-demo.tsx`) all pass my usual pet-hate check — they lead with an outcome ("build me a welcome program, split free and paid") not a capability list. No new finding there. The friend-repeatable-sentence gap and the unbranded-shareable-artifact gap are already filed from prior rounds and still apply; I didn't find a new angle on either worth a separate entry.
