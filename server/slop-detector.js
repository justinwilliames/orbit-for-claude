/**
 * Heuristic AI-slop analysis. Ported from /tmp/get-orbit/lib/slop-detector.ts
 * — keep the two files in sync. No API calls, no AI.
 *
 * The detector scans for patterns catalogued in the anti-slop-editor
 * skill and returns a structured analysis the UI renders directly.
 * For a real rewrite the user copies the prompt the app generates and
 * pastes it into Claude — the heavy lifting happens there, not here.
 *
 * Scoring is intentionally conservative. A clean draft should score
 * 85+; a typical AI first draft 55–75; obvious slop 30–55.
 */

/**
 * The master dictionary. Phrase: [severity, category, label, explanation, fix].
 * Ordered roughly by how much they damage a piece of writing.
 */
const PHRASE_RULES = [
  // Empty authority openers
  { pattern: /\b(in today['’]s\s+(fast-paced|digital|modern|ever-changing|rapidly-evolving)\s+(world|business\s+environment|landscape))/gi, severity: "high", category: "language", label: "Empty opener", explanation: "Generic intros that could belong to any article on any topic.", fix: "Open with a specific claim, number, or story — not a state-of-the-world phrase." },
  { pattern: /\b(it['’]s\s+important\s+to\s+note|it\s+is\s+worth\s+(noting|considering|mentioning|observing)|it['’]s\s+worth\s+(noting|considering|mentioning)|it\s+should\s+be\s+noted|it\s+goes\s+without\s+saying)\b/gi, severity: "high", category: "language", label: "Empty authority phrase", explanation: "Tells the reader something is important without showing why.", fix: "Just make the point. If it's important the writing should demonstrate it." },
  { pattern: /\b(let['’]s\s+(dive|deep\s+dive|take\s+a\s+closer\s+look|explore|unpack|break\s+it\s+down))\b/gi, severity: "high", category: "language", label: "Filler transition", explanation: "A performance of getting-started rather than actually starting.", fix: "Cut it. The next sentence is the start." },
  { pattern: /\b(unlock\s+(the\s+power\s+of|your\s+potential|the\s+secret)|harness\s+the\s+power\s+of|tap\s+into)\b/gi, severity: "high", category: "language", label: "Marketing-speak verb", explanation: "Jargon that signals effort without saying anything.", fix: "Name the specific benefit or action." },

  // Generic closers
  { pattern: /\b(ultimately|at\s+the\s+end\s+of\s+the\s+day|when\s+all\s+is\s+said\s+and\s+done|in\s+essence|in\s+summary|to\s+wrap\s+(up|it\s+up))\b/gi, severity: "high", category: "language", label: "Generic closer", explanation: "Summary phrases that restate rather than land a thesis.", fix: "Either land a sharper conclusion or cut the closer — the reader already read what you wrote." },

  // Transition spam
  { pattern: /\b(furthermore|moreover|additionally|on\s+top\s+of\s+that|besides\s+this)\b/gi, severity: "medium", category: "structure", label: "Transition spam", explanation: "Connectives that add rhythm but no logical relationship.", fix: "Use 'and', 'but', or start a new sentence. Reserve formal transitions for actual logical shifts." },
  { pattern: /\b(that\s+said|having\s+said\s+that|with\s+that\s+being\s+said)\b/gi, severity: "medium", category: "structure", label: "Qualifying filler", explanation: "Signals the writer is about to half-contradict themselves without committing.", fix: "Commit. Either the previous claim holds or it doesn't." },

  // Vague qualifiers
  { pattern: /\b(crucial|vital|essential|critical|key|important)\s+(to|for|in|that)\b/gi, severity: "medium", category: "language", label: "Vague qualifier", explanation: "Claims something matters without evidence or mechanism.", fix: "Replace with the specific reason it matters or the consequence of skipping it." },
  { pattern: /\b(leverage|leveraging|navigate|navigating|harness|harnessing)\b/gi, severity: "medium", category: "language", label: "Corporate jargon", explanation: "Generic business verbs that replace more specific action words.", fix: "Use the specific verb: use, apply, deploy, build, manage, etc." },
  { pattern: /\bmyriad(\s+of)?\b/gi, severity: "low", category: "language", label: "Overused filler word", explanation: "Fancy synonym for 'many' that signals AI drafting.", fix: "Use 'many' or name the specific number if you know it." },
  { pattern: /\b(robust|seamless|cutting-edge|world-class|best-in-class|game-changing|state-of-the-art|comprehensive\s+suite|holistic\s+approach)\b/gi, severity: "medium", category: "language", label: "Marketing adjective", explanation: "Generic praise-words that don't describe anything specific.", fix: "Describe the specific quality: what makes it robust, or seamless, or cutting-edge?" },

  // Over-balanced / non-opinion
  { pattern: /\b(there\s+are\s+(many|several|various|numerous|a\s+number\s+of)\s+(ways|approaches|methods|options|strategies|techniques))\b/gi, severity: "high", category: "substance", label: "Fake completeness", explanation: "Signals thoroughness without committing to a hierarchy.", fix: "Name the two or three that matter most and explain why others don't make the list." },
  { pattern: /\b((each|every)\s+(approach|method|option|strategy|tool)\s+has\s+its\s+(own\s+)?(benefits|advantages|pros\s+and\s+cons))\b/gi, severity: "high", category: "substance", label: "Non-opinion", explanation: "Offering balance instead of judgment.", fix: "Make the call. Which one would you pick and why?" },
  { pattern: /\b(depends\s+on\s+(your|the)\s+(specific\s+)?(needs|requirements|use\s+case|situation|context))\b/gi, severity: "high", category: "substance", label: "Answer-dodge", explanation: "Ending a comparison by telling the reader they have to decide themselves.", fix: "Give the decision rule. What inputs push toward which answer?" },

  // Padding and redundancy
  { pattern: /\b(a\s+wide\s+(variety|range|array)\s+of)\b/gi, severity: "low", category: "redundancy", label: "Padded phrase", explanation: "Three words doing one word's job.", fix: "Say 'many' or name specifics." },
  { pattern: /\b(in\s+order\s+to)\b/gi, severity: "low", category: "redundancy", label: "Padded phrase", explanation: "Three words where one ('to') works.", fix: "Replace with 'to'." },
  { pattern: /\b(due\s+to\s+the\s+fact\s+that)\b/gi, severity: "low", category: "redundancy", label: "Padded phrase", explanation: "Five words where 'because' works.", fix: "Replace with 'because'." },

  // Audience-blind openings
  { pattern: /\b(a\s+business\s+(might|could|can)|imagine\s+a\s+(business|company|organization)\s+that)\b/gi, severity: "medium", category: "audience", label: "Hypothetical-business example", explanation: "Generic example that does no teaching work.", fix: "Use a named real example or describe the specific pattern the example would illustrate." },

  // ─── LinkedIn / inspirational-voice patterns ────────────────────
  // Different dialect from corporate-blog slop but just as
  // formulaic. Captures the "motivational thread" AI-drafting style.
  { pattern: /\b(the\s+(reality|truth|fact|secret|thing)\s+is,?)\s/gi, severity: "medium", category: "language", label: "Soft authority opener", explanation: "Signals wisdom without earning it — same family as 'it's important to note'.", fix: "Just make the claim. If it's true the writing should stand on its own." },
  { pattern: /\b(you['’]re\s+doing\s+(great|amazing|awesome|fine|enough)|you['’]ve\s+got\s+this|you\s+got\s+this|keep\s+going\b)/gi, severity: "high", category: "language", label: "Unearned validation closer", explanation: "Performative reassurance with nothing specific behind it. Signature of AI-drafted LinkedIn posts.", fix: "Cut it. If the reader needs specific next steps, give those. If they don't, the closer isn't doing anything." },
  { pattern: /(?:^|\s)([✨🚀💪🙌🔥💯⚡️])(?:\s|$)/g, severity: "medium", category: "language", label: "Inspirational emoji sign-off", explanation: "Generic hype-emoji ending — reads mimicking LinkedIn tone.", fix: "Either the closing line is strong enough to stand alone or it isn't. The emoji doesn't rescue it." },
  { pattern: /\b(smell\s+the\s+roses|zoom\s+out\s+for\s+a\s+(moment|second|minute|sec)|take\s+a\s+(deep\s+)?breath|pause\s+and\s+reflect|embrace\s+the\s+(journey|process))\b/gi, severity: "medium", category: "language", label: "Motivational cliché", explanation: "Stock inspirational phrase that does no work specific to this subject.", fix: "Name the specific thing you want the reader to do or notice. Cut the cliché." },
  { pattern: /\b(puts?\s+you\s+(in\s+the\s+top|ahead\s+of)\s+(the\s+)?(\d+%|about\s+\d+%|most\s+people|everyone))\b/gi, severity: "high", category: "substance", label: "Fabricated percentile stat", explanation: "Made-up 'you're ahead of X%' statistic with no source — classic AI tell.", fix: "Either cite the real number or make the point without a fake quantification." },
  { pattern: /\b(people\s+(building|doing|making|creating|shipping)\s+(cool|amazing|incredible|awesome|wild)\s+(things|stuff|stuff\s+out\s+there))\b/gi, severity: "medium", category: "language", label: "Vague warm filler", explanation: "'Cool things' phrasing that gestures at specifics without providing any.", fix: "Name the things. If you can't, the observation isn't worth making." },
  { pattern: /\b(being\s+in\s+the\s+(conversation|room|arena|game)\s+(at\s+all|already))\b/gi, severity: "medium", category: "language", label: "Vague belonging phrase", explanation: "Abstract membership language that could apply to any context.", fix: "Name the specific group or behaviour. 'Reading the Orbit newsletter' beats 'being in the conversation'." },
  { pattern: /\b(let\s+me\s+tell\s+you|here['’]s\s+the\s+truth|here['’]s\s+what\s+I['’]ve\s+learned|here['’]s\s+what\s+no\s+one\s+tells\s+you)\b/gi, severity: "medium", category: "language", label: "Thread-bro opener", explanation: "Viral-thread hook that telegraphs AI-drafted LinkedIn content.", fix: "Lead with the claim itself, not the promise of a reveal." },
  { pattern: /\b(hot\s+take|unpopular\s+opinion|controversial\s+opinion)\s*[:.]/gi, severity: "medium", category: "language", label: "Attention-bait opener", explanation: "Signals 'here comes a take' instead of just making the take.", fix: "Just state the take. If it's genuinely unpopular the reader will notice without the label." },
  { pattern: /\b((it|this|that)\s+feels\s+like)\b/gi, severity: "medium", category: "language", label: "Hedge-feeling phrase", explanation: "Soft-pedals a claim by wrapping it in 'feels like' — common AI evasion.", fix: "Either commit to the claim or remove it. If you're unsure, name what you're unsure about." },
  { pattern: /\bfeels\s+(very\s+)?(real|personal|meaningful|important|significant|right|wrong|off|different|powerful|genuine)\b/gi, severity: "medium", category: "language", label: "Feels-adjective hedge", explanation: "'Feels [adjective]' is the same hedge as 'feels like' — claims a feeling rather than a fact.", fix: "State the fact, or state what specifically made it feel that way." },
  { pattern: /\b(the\s+thing\s+that\s+(stands\s+out|matters\s+most|strikes\s+me|hits\s+me)\s+(most\s+)?(is|was))\b/gi, severity: "medium", category: "language", label: "Pointing-phrase opener", explanation: "'The thing that stands out most is…' is LinkedIn-voice preamble before a generic observation.", fix: "State the observation directly as the opener." },
  { pattern: /\b(the\s+start\s+of\s+something\s+(real|big|meaningful|good|important|special))\b/gi, severity: "high", category: "language", label: "LinkedIn closer trope", explanation: "'The start of something real / big' is a stock LinkedIn-post sign-off.", fix: "Close on a specific commitment or observation. Cut the trope." },
  { pattern: /\b(played\s+(a\s+big\s+role|a\s+huge\s+role|an\s+important\s+role|a\s+big\s+part)\s+in)\b/gi, severity: "low", category: "language", label: "Vague credit phrase", explanation: "'Played a big role in that' is generic gratitude filler — says nothing about what was actually done.", fix: "Name what the person actually did: what decision, what help, what direction." },
  { pattern: /\b(operating\s+at\s+the\s+edge|pushing\s+the\s+edge|at\s+the\s+frontier\s+of)\b/gi, severity: "medium", category: "language", label: "Vague superlative", explanation: "Abstract claim of cutting-edge-ness with no specifics.", fix: "Name the specific techniques or tools that justify the claim." },
  { pattern: /\b(brings?\s+a\s+lot\s+of\s+energy|makes?\s+a\s+(big\s+)?difference|a\s+constant\s+pull)\b/gi, severity: "low", category: "language", label: "Warm filler phrase", explanation: "Generic positive phrasing that gestures at quality without naming it.", fix: "Describe the specific behaviour or outcome. 'Ships every feature on time' beats 'makes a difference'." },
  { pattern: /\b(real\s+weight\s+behind\s+it|something\s+with\s+(real\s+)?weight)\b/gi, severity: "medium", category: "language", label: "Gravitas trope", explanation: "'Real weight behind it' is stock LinkedIn-gravitas language.", fix: "Describe the specific substance. What resources, what team, what commitment?" },
  { pattern: /\b(I['’]m\s+starting\s+to\s+see\s+a\s+world\s+where|I\s+keep\s+coming\s+back\s+to|the\s+part\s+I\s+keep\s+coming\s+back\s+to)\b/gi, severity: "high", category: "language", label: "LinkedIn thread hook", explanation: "Viral-thread opener/bridge — signature of AI-drafted thought-leadership posts.", fix: "Lead with the observation itself. Don't announce that you're about to share one." },
  { pattern: /\b(there['’]s\s+(probably\s+)?(a\s+new|something)\s+shape\s+forming|there['’]s\s+something\s+(new|different)\s+emerging|a\s+new\s+(kind\s+of|shape|pattern)\s+forming)\b/gi, severity: "medium", category: "language", label: "Vague pattern-observation", explanation: "Abstract 'something is forming' phrasing without naming what.", fix: "Name the pattern concretely, or don't claim one exists." },
  { pattern: /\b(it\s+raises\s+a\s+real\s+question|this\s+raises\s+a\s+real\s+question|it\s+begs\s+the\s+question)\b/gi, severity: "medium", category: "language", label: "Rhetorical-question preamble", explanation: "Used as thought-leadership bridge before a generic question.", fix: "Ask the question directly, or skip it if it's rhetorical." },
  { pattern: /\b(what\s+this\s+means\s+for\s+(people|teams|us|the\s+industry|you))\b/gi, severity: "low", category: "language", label: "Implication-opener trope", explanation: "'What this means for X' is a LinkedIn-standard implication setup.", fix: "State the implication directly." },
  { pattern: /\b((?:a|one)\s+(wider|bigger|broader)\s+surface\s+area|cover\s+(a\s+)?much\s+wider\s+surface)\b/gi, severity: "medium", category: "language", label: "Corporate metaphor", explanation: "'Wider surface area' is MBA-adjacent jargon used to dress up 'more work'.", fix: "Say 'more work' or name the specific additional scope." },
  { pattern: /\b(the\s+shape\s+of\s+(work|things)\s+(has\s+changed|is\s+changing)|what\s+["“]good["”]\s+looks\s+like|the\s+future\s+of\s+work)\b/gi, severity: "high", category: "language", label: "LinkedIn trope phrase", explanation: "Stock 'future of work' language that could sit on any thought-leadership post.", fix: "Describe the specific change with specific examples, or delete." },
  { pattern: /\bin\s+a\s+fraction\s+of\s+(the\s+time|that|this)\b/gi, severity: "medium", category: "language", label: "Stock comparison", explanation: "Vague 'fraction of the time' phrasing that implies a measurement nobody took.", fix: "Give the real ratio or the actual time saved. Or cut." },
  { pattern: /\b(judgement|judgment|taste|standards|wisdom|experience|intuition)\s+sits\s+there\b/gi, severity: "high", category: "structure", label: "Abstract-noun-sits-there triplet", explanation: "Signature pattern of AI LinkedIn prose — '[abstract quality] sits there' used for emphasis.", fix: "Rewrite with concrete verbs. 'Judgement decides what ships.' beats 'Judgement sits there.'" },
  { pattern: /\b(a\s+lot\s+of\s+(the\s+work|my\s+day|what|people))\b/gi, severity: "low", category: "language", label: "Vague quantifier", explanation: "'A lot of' used as emphatic filler rather than a real estimate.", fix: "Name a concrete proportion, or remove the quantifier and state the observation directly." },
  { pattern: /\b(happening\s+in\s+real\s+time|in\s+real\s+time\s+now)\b/gi, severity: "medium", category: "language", label: "Hollow urgency closer", explanation: "'Happening in real time' used as dramatic closer without specifying what's happening.", fix: "Close on a specific observation or action, not a mood." },
  { pattern: /\b(what\s+followed\s+felt\s+simple|what\s+happened\s+next\s+was|and\s+then\s+something\s+changed)\b/gi, severity: "medium", category: "language", label: "Thread-narrative bait", explanation: "Suspense-framing used to pull readers through a LinkedIn post — telegraphs AI template.", fix: "Describe what actually followed, plainly. Don't tease." },
  { pattern: /\b(?:there['’]?s|there\s+is|this\s+is|that['’]?s)\s+a\s+(?:specific|particular|certain|peculiar|unique)\s+(?:kind|type|sort|flavou?r|breed)\s+of\s+\w+\s+that\s+(?:only\s+|just\s+)?(?:comes?|arrives?|begins?|grows?|emerges|happens?|exists?)\b/gi, severity: "high", category: "language", label: "Specific-kind-of-X opener", explanation: "'There's a specific kind of [feeling] that comes from…' — viral 2025–26 emotional-essay opener template, propagating across Instagram captions, Reddit confessions, and LinkedIn reflection posts.", fix: "Name the feeling and its specific cause directly. 'You feel exposed when you broadcast your life to people you haven't vetted' beats 'there's a specific kind of vulnerability that comes from…'." },
  // NB: for patterns that proliferate into many surface variants
  // ("you'll grow faster than you thought / than was possible /
  // than you ever imagined / than anyone expects…") we use a
  // skeleton matcher further down. The regex here is wide but not
  // exhaustive; the skeleton pass catches the stragglers.
  { pattern: /\byou['’]?ll\s+(grow|learn|improve|move|progress|develop|advance|expand|evolve|transform|rise|climb|scale)\s+(faster|quicker|more|further|harder|higher|bigger|stronger|sharper)\s+than\s+(you|was|it['’]?s|anyone|ever\s+was|ever|you\s+ever)\s*(thought|imagined|expected|believed|dreamed|hoped|possible)?(\s+possible)?\b/gi, severity: "high", category: "language", label: "Motivational growth closer", explanation: "LinkedIn evergreen sign-off — 'you'll grow faster than X possible'.", fix: "Close with what you'd actually tell someone considering the move. Cut the platitude." },
  { pattern: /\b(a\s+|an\s+)?(huge|incredible|massive|game-changing|invaluable|tremendous)\s+(asset|help|resource|addition|advantage)\b/gi, severity: "medium", category: "language", label: "Praise-filler noun phrase", explanation: "'Huge asset' / 'incredible help' — generic praise that doesn't name what's valuable about it.", fix: "Describe the specific thing it helped with. 'Shaped the information architecture' beats 'huge asset'." },
  { pattern: /\b(human\s+touch|human\s+element|human\s+side\s+of\s+things|that\s+human\s+connection)\b/gi, severity: "medium", category: "language", label: "Human-touch cliché", explanation: "'The human touch' is the most overused AI-vs-human talking point of 2024–26.", fix: "Name the specific thing a human brings that AI doesn't — taste, judgement, a particular decision." },
  { pattern: /\bthat['’]s\s+the\s+(bit|part|piece|thing)\s+I\s+(love|enjoy|live\s+for)\b/gi, severity: "low", category: "language", label: "Personal-flourish closer", explanation: "LinkedIn-style reveal of what 'I' personally love — recycled across hundreds of AI-drafted posts.", fix: "Either name what specifically about that you love, or cut it." },
  { pattern: /\b(from\s+a\s+blank\s+(canvas|page|sheet)|from\s+zero\s+to\s+(one|live|launched|shipped))\b/gi, severity: "medium", category: "language", label: "Journey-opener trope", explanation: "'From a blank canvas to…' is a stock LinkedIn project-reveal opener.", fix: "Start with the actual work or outcome, not the meta-narrative of starting." },
  { pattern: /\bno\s+such\s+thing\s+as\s+["“]?that['’]s\s+not\s+my\s+job["”]?\b/gi, severity: "medium", category: "language", label: "Startup platitude", explanation: "'No such thing as 'that's not my job'' is stock startup-culture filler.", fix: "Describe the specific boundary crossing you did. 'Moved from graphic design into product conversations' beats the platitude." },
  { pattern: /\bturns\s+out\s+(the\s+two\s+aren['’]t\s+that\s+different|they['’]re\s+(the\s+same|more\s+alike)|there['’]s\s+more\s+overlap)\b/gi, severity: "medium", category: "language", label: "Thread-punchline pattern", explanation: "The 'turns out X and Y aren't that different' reveal is LinkedIn thread-punchline rhythm.", fix: "State the actual relationship between the two things with specifics." },
  { pattern: /\b(grow\s+faster\s+than\s+you\s+thought|push\s+yourself\s+harder\s+than|achieve\s+more\s+than\s+you\s+imagined|surprise\s+yourself\s+with)\b/gi, severity: "medium", category: "language", label: "Growth-mindset platitude", explanation: "Stock inspirational growth phrase, AI-drafted flavour of it.", fix: "Name the specific thing a reader might gain or do. Cut the abstraction." },
  { pattern: /\bthis\s+is\s+your\s+sign\s+to\b/gi, severity: "high", category: "language", label: "LinkedIn CTA cliché", explanation: "'This is your sign to…' is the most overused LinkedIn call-to-action of the last 3 years.", fix: "Make the actual request. 'Register for the open day' beats 'this is your sign to…'." },
  { pattern: /\bif\s+you['’]?ve\s+ever\s+(wondered|thought|considered|asked\s+yourself)\s+(whether|if|about)\b/gi, severity: "medium", category: "language", label: "If-you've-ever-wondered opener", explanation: "Generic hypothetical hook used as a CTA setup.", fix: "Address the specific reader you're actually trying to reach." },
  { pattern: /\b(opens?|opened|opening)\s+(doors|new\s+doors|doors\s+(you|I)\s+never\s+(expected|imagined|thought))\b/gi, severity: "medium", category: "language", label: "Opens-doors cliché", explanation: "'Opened doors I never expected' is LinkedIn-journey-post stock phrasing.", fix: "Name the specific opportunity or connection it created." },
  { pattern: /\balong\s+the\s+way,?\s+I\s+(found|discovered|learned|realised|realized|gained|built)\b/gi, severity: "medium", category: "language", label: "Along-the-way reflection", explanation: "'Along the way, I found X' — stock LinkedIn reflection opener.", fix: "Describe what you found without the journey-frame." },
  { pattern: /\b(healthy\s+dose\s+of\s+(imposter|impostor)\s+syndrome|case\s+of\s+(imposter|impostor)\s+syndrome)\b/gi, severity: "medium", category: "language", label: "Imposter-syndrome cliché", explanation: "Overused self-deprecating LinkedIn trope.", fix: "Describe the specific doubt or moment. 'I kept checking if I belonged in the room' beats 'imposter syndrome'." },
  { pattern: /\b(cut\s+through\s+(my|the|her|his|their)\s+(hesitation|doubt|confusion|noise|clutter|uncertainty))\b/gi, severity: "medium", category: "language", label: "Cut-through-the-X trope", explanation: "'Advice cut through my hesitation' — AI-narrative metaphor.", fix: "Describe what the advice actually said, not its rhetorical effect." },
  { pattern: /\b(find(ing)?|found)\s+(my|your|her|his|their)\s+footing\b/gi, severity: "low", category: "language", label: "Find-your-footing metaphor", explanation: "'Find my footing' is a stock transition-phase cliché.", fix: "Describe what you were specifically doing to reorient." },
  { pattern: /\b(that|the)\s+feeling\s+(shifted|changed|started\s+to\s+shift|started\s+to\s+change)\b/gi, severity: "medium", category: "language", label: "Feeling-shifted trope", explanation: "'That feeling shifted' — stock narrative pivot phrasing.", fix: "Describe what specifically changed, not how the feeling evolved." },
  { pattern: /\b(found|gained|built)\s+(confidence|community|clarity|purpose|perspective|connection)\s*,\s*(confidence|community|clarity|purpose|perspective|connection)\s*,?\s*(and\s+)?\s*(a\s+(?:new\s+)?)?(confidence|community|clarity|purpose|perspective|connection|voice|belonging)\b/gi, severity: "high", category: "structure", label: "Abstract-triplet discovery", explanation: "'I found confidence, community, and a new perspective' — classic AI rule-of-three abstract-noun list.", fix: "Pick the one that matters most. Describe it concretely. Cut the other two or merge them into the sentence." },
  { pattern: /\b(changed|changes)\s+my\s+life\b/gi, severity: "medium", category: "language", label: "Changed-my-life cliché", explanation: "Most overused LinkedIn-transformation closer.", fix: "Describe the specific change. 'I stopped working weekends' beats 'it changed my life'." },
  { pattern: /\b(never\s+been\s+more\s+(excited|proud|grateful|ready)|couldn['’]?t\s+be\s+more\s+(excited|proud|grateful|ready))\b/gi, severity: "medium", category: "language", label: "Never-been-more-X superlative", explanation: "LinkedIn emotion-inflation phrase.", fix: "Scale the claim back to something believable, or make the specific source of feeling explicit." },
  { pattern: /\b(at\s+the\s+end\s+of\s+the\s+day|when\s+push\s+comes\s+to\s+shove)\b/gi, severity: "medium", category: "language", label: "End-of-day filler", explanation: "Stock transition phrase that does no work.", fix: "Cut it. The sentence after will stand on its own." },
  { pattern: /\b(has\s+been\s+a\s+whirlwind|what\s+a\s+whirlwind|what\s+a\s+week|what\s+a\s+ride)\b/gi, severity: "medium", category: "language", label: "Whirlwind week cliché", explanation: "Stock week-summary opener — 'has been a whirlwind' is a LinkedIn staple.", fix: "Describe what specifically made the week intense, with a real detail." },
  { pattern: /\b(end-to-end\s+spectrum|full\s+spectrum\s+of\s+the\s+business|full\s+end-to-end)\b/gi, severity: "medium", category: "language", label: "End-to-end-spectrum jargon", explanation: "Corporate filler that signals 'I touched many things' without specifics.", fix: "Name the specific areas. 'Product, data, and brand' beats 'end-to-end spectrum'." },
  { pattern: /\b(from\s+day\s+one|since\s+day\s+one)\b/gi, severity: "low", category: "language", label: "Day-one cliché", explanation: "'From day one' — stock startup-onboarding phrase.", fix: "Give the actual timeframe. 'By my third standup' beats 'from day one'." },
  { pattern: /\b(in\s+tandem|in\s+parallel,?\s+with|working\s+alongside)\b/gi, severity: "low", category: "language", label: "Corporate-speak connector", explanation: "'In tandem / in parallel' used to dress up 'at the same time'.", fix: "Use 'at the same time' or restructure to show the actual coordination." },
  { pattern: /\b(feedback\s+loops?\s+are\s+tight|tight\s+feedback\s+loops)\b/gi, severity: "medium", category: "language", label: "Tight-feedback-loops cliché", explanation: "AI-era stock phrase, dropped in for velocity-bragging.", fix: "Name the specific iteration cadence. 'We ship twice a day' beats 'tight feedback loops'." },
  { pattern: /\b(things\s+ship\s+(quickly|fast)|we\s+ship\s+(quickly|fast))\b/gi, severity: "low", category: "language", label: "Ship-fast filler", explanation: "Generic velocity claim with no content.", fix: "Give the actual cadence and what shipped." },
  { pattern: /\b(ownership\s+sits\s+close\s+to\s+the\s+problem|decisions\s+happen\s+in\s+the\s+room)\b/gi, severity: "high", category: "language", label: "Startup ownership cliché", explanation: "Stock phrases dressing up 'small team, fast decisions'.", fix: "Describe the actual decision cadence with an example." },
  { pattern: /\b(big\s+(few\s+weeks|week|month|year)\s+ahead|exciting\s+(times|weeks|months)\s+ahead)\b/gi, severity: "medium", category: "language", label: "Exciting-ahead closer", explanation: "Placeholder closer when there's nothing specific to end on.", fix: "Name a specific thing that's coming in that timeframe, or just stop." },
  { pattern: /\b(moving?\s+from\s+idea\s+to\s+\w+\s+to\s+\w+\s+to\s+\w+)\b/gi, severity: "medium", category: "structure", label: "Idea-to-N-abstracts journey", explanation: "'From idea to structured thinking to analysis to documented action' — AI rule-of-four abstract-noun journey.", fix: "Pick the one transition that matters most and describe it concretely." },
  { pattern: /\b(almost\s+immediately|pretty\s+much\s+immediately|right\s+away\s+I)\b/gi, severity: "low", category: "language", label: "Time-filler qualifier", explanation: "'Almost immediately' softens a timeframe without adding precision.", fix: "State the actual time. 'Within three days' beats 'almost immediately'." },
  { pattern: /\b(energis(?:ed|ing)\s+about|energi?z(?:ed|ing)\s+about)\b/gi, severity: "low", category: "language", label: "Energised-about opener", explanation: "Stock LinkedIn enthusiasm-bragging opener.", fix: "Describe what specifically is energising with a real detail." },

  // ═══════════════════════════════════════════════════════════════════
  // MARKETING SLOP — the "unleash/empower/transform/elevate" cluster
  // ═══════════════════════════════════════════════════════════════════
  { pattern: /\b(unleash|unlock)\s+(your|the|their|a|an|a\s+new\s+kind\s+of)\s+(full\s+)?(potential|creativity|power)\b/gi, severity: "high", category: "language", label: "Unleash-your-potential cliché", explanation: "Most overused empty-motivation phrase in marketing copy.", fix: "Name the specific outcome or capability. 'Ship two campaigns a week instead of one' beats 'unleash your potential'." },
  { pattern: /\b(transform|revolutionize|revolutionise|reimagine)\s+(the\s+way\s+(you|we|they)|your|how\s+you)\s+\w+/gi, severity: "high", category: "language", label: "Transform-the-way-you-X opener", explanation: "Template marketing claim — reads as product-page filler.", fix: "Describe the specific change with a before/after that a user would recognise." },
  { pattern: /\b(empowers?|empowering|empowered)\s+(teams?|people|you|users|customers|businesses|organizations|organisations)\b/gi, severity: "medium", category: "language", label: "Empowers-teams cliché", explanation: "Stock SaaS copy verb. 'Empowering' is the tell-tale marketing drum.", fix: "Name the specific capability the tool unlocks. 'Lets you edit Canvas flows without opening the Braze UI' beats 'empowers teams'." },
  { pattern: /\b(drives?|driving|delivers?|delivering)\s+(sustainable\s+)?(growth|results|engagement|revenue|value|success|outcomes|impact|change)\b/gi, severity: "medium", category: "language", label: "Drive-growth cliché", explanation: "'Drives growth / delivers results' is the most generic verb+object pair in B2B copy.", fix: "Name the specific metric and the specific mechanism." },
  { pattern: /\b(ahead\s+of\s+the\s+curve|stay\s+ahead|get\s+ahead\s+of)\b/gi, severity: "medium", category: "language", label: "Ahead-of-the-curve cliché", explanation: "Consultant-deck filler that says 'be early' with extra syllables.", fix: "Say 'move first' or name the specific timing advantage." },
  { pattern: /\b(thriv(?:e|ing)\s+in\s+the\s+(new|modern|digital|fast-paced|evolving|changing)\s+(era|age|world|landscape|economy))\b/gi, severity: "high", category: "language", label: "Thrive-in-the-new-era cliché", explanation: "Keynote-slide filler with no actual information.", fix: "Name the specific shift and the specific adjustment required." },
  { pattern: /\b(innovative|forward-thinking|cutting-edge|best-in-class|next-generation|next-gen|industry-leading|world-class)\s+(platform|solution|technology|approach|company|brand|team)\b/gi, severity: "high", category: "language", label: "Adjective-stacked positioning", explanation: "Self-praise adjective + generic noun — the signature phrase of marketing-site boilerplate.", fix: "Describe what specifically is innovative / leading / cutting-edge. The adjective alone carries no information." },
  { pattern: /\b(passionate\s+about|deeply\s+committed\s+to|laser-focused\s+on|obsessed\s+with\s+helping)\b/gi, severity: "medium", category: "language", label: "Passionate-about filler", explanation: "Corporate self-description that says 'we care' without naming what we do.", fix: "Describe the specific thing you do. 'We rewrite Canvas templates' beats 'passionate about helping brands'." },
  { pattern: /\b(data-driven\s+(insights?|decisions?|approach|strategy)|data-led\s+approach)\b/gi, severity: "medium", category: "language", label: "Data-driven cliché", explanation: "'Data-driven insights' is the most overused phrase in SaaS marketing.", fix: "Name the specific data or the specific decision. 'Open-rate cohorts drive send-time' beats 'data-driven insights'." },
  { pattern: /\b(meaningful\s+(ways?|experiences?|impact|connections?|relationships?))\b/gi, severity: "medium", category: "language", label: "Meaningful-ways filler", explanation: "'Meaningful' is code for 'we couldn't name what we actually do'.", fix: "Describe what specifically is meaningful — a specific connection, a specific outcome." },
  { pattern: /\b(every\s+(single\s+)?(touchpoint|interaction|step\s+of\s+the\s+way|step\s+of\s+the\s+journey))\b/gi, severity: "medium", category: "language", label: "Every-touchpoint cliché", explanation: "Customer-journey filler phrase — no information content.", fix: "Name the two or three specific moments that matter." },
  { pattern: /\b(your\s+journey\s+to|the\s+journey\s+to)\s+\w+/gi, severity: "high", category: "language", label: "Your-journey-to cliché", explanation: "'Your journey to marketing excellence' — the single clearest marketing-copy template.", fix: "Lead with the outcome or the first specific step, not the journey framing." },
  { pattern: /\b(from\s+ideation\s+to\s+execution|from\s+strategy\s+to\s+execution|end-to-end\s+(solutions?|service|platform))\b/gi, severity: "medium", category: "language", label: "End-to-end cliché", explanation: "Consulting-speak that signals breadth without describing anything.", fix: "Name the specific stages. 'We handle brief, draft, review, and send' beats 'end-to-end solution'." },
  { pattern: /\b(a\s+)?team\s+of\s+(experts|specialists|professionals|passionate\s+\w+)\b/gi, severity: "medium", category: "language", label: "Team-of-experts filler", explanation: "Agency-site filler — every company has a 'team of experts'.", fix: "Describe the specific people or the specific skill. 'Two ex-Braze solutions architects' beats 'team of experts'." },
  { pattern: /\b(tell\s+(your|their)\s+stor(y|ies)|share\s+(your|their)\s+stor(y|ies)|brand\s+stor(y|ies))\b/gi, severity: "medium", category: "language", label: "Brand-story cliché", explanation: "'Tell your story' is the most overused marketing-agency phrase.", fix: "Name the specific message or audience. 'Position the free trial to trial-converters' beats 'tell your story'." },
  { pattern: /\b(join\s+(thousands|millions|hundreds)\s+of|trusted\s+by\s+(thousands|millions|industry\s+leaders))\b/gi, severity: "medium", category: "language", label: "Vague social-proof filler", explanation: "'Join thousands of forward-thinking companies' — no specific customer named, no outcome quantified.", fix: "Name one specific customer and what they do with the product." },
  { pattern: /\b(at\s+scale|at-scale|enterprise-grade|enterprise-ready)\b/gi, severity: "low", category: "language", label: "At-scale filler", explanation: "'At scale' is used to imply seriousness without specifying the actual scale.", fix: "Name the actual scale. '10M events/day' beats 'at scale'." },
  { pattern: /\b(top-performing|top-tier|world-class|best-in-class)\s+(brands?|teams?|companies|marketers|creators?)\b/gi, severity: "medium", category: "language", label: "Top-performing filler", explanation: "Adjective-padding used to imply authority without evidence.", fix: "Name the specific brand or the specific metric that makes them 'top-performing'." },

  // ═══════════════════════════════════════════════════════════════════
  // CORPORATE OPENER TEMPLATES
  // ═══════════════════════════════════════════════════════════════════
  { pattern: /\bin\s+an?\s+(increasingly|ever-?(changing|evolving)|rapidly-?(changing|evolving))\s+\w+\s+(business\s+)?(environment|landscape|world|economy|market)\b/gi, severity: "high", category: "language", label: "In-an-increasingly-X opener", explanation: "Most common corporate-opener template — interchangeable with any other topic.", fix: "Open with a specific claim about your topic, not a state-of-the-world preamble." },
  { pattern: /\b(organi[sz]ations?|businesses|companies|teams?)\s+must\s+(leverage|embrace|adopt|navigate|adapt\s+to|harness|deploy)\b/gi, severity: "high", category: "language", label: "Organizations-must prescription", explanation: "Prescriptive corporate opener with no specific mechanism.", fix: "Name the specific action and the specific consequence of not taking it." },
  { pattern: /\b(the\s+future\s+of\s+\w+\s+(is|belongs\s+to)|the\s+future\s+belongs\s+to)\b/gi, severity: "high", category: "language", label: "Future-of-X template", explanation: "'The future of work is hybrid / the future belongs to those who…' — empty prediction framing.", fix: "Make the specific claim. 'Remote-first teams ship 30% faster' beats 'the future of work is hybrid'." },
  { pattern: /\bimagine\s+a\s+world\s+(where|in\s+which)\b/gi, severity: "high", category: "language", label: "Imagine-a-world opener", explanation: "Keynote-slide opener with zero content — pure hypothetical filler.", fix: "Describe the specific current problem or the specific future state. Skip the 'imagine' frame." },
  { pattern: /\b(powered\s+by\s+AI|AI-powered|AI-driven|powered\s+by\s+machine\s+learning)\b/gi, severity: "medium", category: "language", label: "AI-powered filler", explanation: "Generic tech-washing that says 'we used ML' without describing anything specific.", fix: "Name the specific model, task, or capability. 'Claude classifies the deliverability risk' beats 'AI-powered'." },
  { pattern: /\ba\s+(symphony|tapestry|mosaic|ecosystem|universe|constellation)\s+of\s+\w+/gi, severity: "high", category: "language", label: "Corporate metaphor soup", explanation: "'A symphony of perfectly-timed signals' / 'a tapestry of touchpoints' — decorative filler.", fix: "Describe the specific coordination or components. Cut the metaphor." },
  { pattern: /\b(seen,?\s+heard,?\s+and\s+valued|seen\s+and\s+heard|(felt|truly)\s+understood)\b/gi, severity: "medium", category: "language", label: "Feels-seen cliché", explanation: "Customer-experience-deck filler — evokes emotion without describing behaviour.", fix: "Describe the specific behaviour change: what does the customer experience differently?" },
  { pattern: /\b(isn'?t|doesn'?t|aren'?t)\s+(just|simply|only|about)?\s*\w+(?:\s+\w+){0,3}\s*[—–-]\s*(it|they|we|you)['’]?s?\s*(is|are|do|will|can|'s|'re|'ll|just|only)?\b/gi, severity: "high", category: "structure", label: "Not-just-X-but-Y template", explanation: "'AI isn't replacing us — it's empowering us' / 'CRM doesn't just react — it predicts' — the rhetorical template of every AI-optimism piece.", fix: "Drop the dismissal setup. Make the positive claim directly." },
  { pattern: /\b\w+\s+(isn'?t|aren'?t)\s+(?:\w+\s+){1,5}?,?\s*but\s+(?:a|an|the|rather)\b/gi, severity: "medium", category: "structure", label: "X-isn't-Y-but-Z template", explanation: "'Marketing isn't a guessing game, but a symphony of…' — LinkedIn reveal-structure pattern.", fix: "State what it is without the dismissal of what it isn't." },
  { pattern: /\b(the\s+best\s+\w+\s+aren'?t\s+the\s+ones\s+(that|who))\b/gi, severity: "high", category: "language", label: "Best-X-aren't-the-ones template", explanation: "'The best teams aren't the ones that resist' — LinkedIn leadership-wisdom template.", fix: "Make the positive claim about the best without the comparative setup." },
  { pattern: /\bcombines?\s+human\s+\w+\s+with\s+(machine|AI|artificial)\s+\w+/gi, severity: "high", category: "language", label: "Human-plus-machine cliché", explanation: "'Combines human creativity with machine precision' — the most overused AI-partnership trope.", fix: "Name the specific human contribution and the specific AI contribution. Cut the framing." },
  { pattern: /\ba\s+new\s+kind\s+of\s+(potential|success|work|growth|thinking|leadership|creativity|intelligence)\b/gi, severity: "medium", category: "language", label: "New-kind-of cliché", explanation: "'A new kind of potential' — vague claim that something has transcended its category.", fix: "Name what specifically is different. Cut the 'new kind of' frame." },
  { pattern: /\b(success\s+(isn'?t|is\s+not)\s+about|happiness\s+(isn'?t|is\s+not)\s+about|(leadership|growth|work)\s+isn'?t\s+about)\b/gi, severity: "high", category: "language", label: "X-isn't-about-Y opener", explanation: "'Success isn't about being the smartest' — LinkedIn wisdom-post opener template.", fix: "Make the positive claim directly. 'Curiosity beats intelligence' beats 'success isn't about intelligence'." },
  { pattern: /^remember\s*[:.]/gim, severity: "medium", category: "language", label: "Remember-colon teacher tone", explanation: "'Remember: the best leaders aren't born' — lecturing opener that signals a platitude is coming.", fix: "Just make the claim. The reader doesn't need to be told to remember." },

  // ═══════════════════════════════════════════════════════════════════
  // CLOSING-PARAGRAPH SLOP
  // ═══════════════════════════════════════════════════════════════════
  { pattern: /\b(in\s+conclusion|to\s+conclude|to\s+sum\s+up|to\s+summari[sz]e|in\s+summary)\b/gi, severity: "high", category: "structure", label: "In-conclusion opener", explanation: "Summary connective that restates rather than lands.", fix: "Just make the closing claim. Readers know the essay is ending." },
  { pattern: /\bthe\s+key\s+(takeaway|learning|lesson|insight|point)\s+(is|here\s+is|to\s+remember)\b/gi, severity: "high", category: "language", label: "Key-takeaway cliché", explanation: "Classroom-summary filler — signals a point without committing to it.", fix: "State the point directly. If the reader needed a label to notice it, it's probably not sharp enough." },
  { pattern: /\b(resonate|resonates?|resonating)\s+with\s+(your|their|the|our)\s+(audience|customers|readers|users|team)\b/gi, severity: "medium", category: "language", label: "Resonate-with cliché", explanation: "Content-marketing filler — 'resonate' is code for 'we don't know what people will actually do'.", fix: "Name the specific response you're after: open, click, reply, buy, tell a friend." },
  { pattern: /\b(starts\s+with\s+a\s+single\s+step|begins\s+with\s+(a\s+single\s+step|understanding)|starts\s+with\s+understanding)\b/gi, severity: "high", category: "language", label: "Starts-with-a-single-step cliché", explanation: "'The journey of a thousand miles' recycled as closing-paragraph filler.", fix: "Name the actual first step. 'Pull a 30-day engagement export from Braze' beats 'starts with understanding'." },
  { pattern: /\b(impactful|impact-driven|results-driven|high-impact)\s+(experiences?|campaigns?|strategies|initiatives?|content)\b/gi, severity: "medium", category: "language", label: "Impactful-experiences cliché", explanation: "'Impactful experiences' is marketing-speak for 'good ones'.", fix: "Name the specific outcome. 'Higher reply rate on winback emails' beats 'impactful experiences'." },
  { pattern: /\b(it\s+requires\s+a\s+cultural\s+shift|a\s+cultural\s+shift\s+(that|which))\b/gi, severity: "medium", category: "language", label: "Cultural-shift cliché", explanation: "Corporate-transformation filler — implies change without naming it.", fix: "Name the specific behaviour or process that has to change." },
  { pattern: /\b(continuous\s+(learning|improvement|growth|innovation)|a\s+culture\s+of\s+(learning|innovation|excellence))\b/gi, severity: "medium", category: "language", label: "Continuous-learning cliché", explanation: "Corporate-values deck filler — implies a practice without describing it.", fix: "Name the specific ritual. 'Friday retros' beats 'continuous learning'." },
  { pattern: /\b(embraces?|embracing|embrace)\s+(experimentation|change|uncertainty|failure|the\s+journey|innovation)\b/gi, severity: "medium", category: "language", label: "Embraces-X cliché", explanation: "'Embraces experimentation' / 'embrace change' — corporate-culture filler verb.", fix: "Describe the specific behaviour. 'Ships half-finished ideas weekly' beats 'embraces experimentation'." },

  // ═══════════════════════════════════════════════════════════════════
  // THREAD-BRO / LINKEDIN PLATITUDES
  // ═══════════════════════════════════════════════════════════════════
  { pattern: /\b(the\s+best\s+(leaders?|teams?|founders?|people|creators?|marketers?)\s+aren'?t\s+(born|made)[.\s—–-]+they'?re\s+(built|made|born))\b/gi, severity: "high", category: "language", label: "Best-leaders-aren't-born cliché", explanation: "Most recycled LinkedIn wisdom-platitude on the internet.", fix: "Cut the platitude. If you have a specific leadership observation, make it without the setup." },
  { pattern: /\b(one\s+day\s+at\s+a\s+time|one\s+step\s+at\s+a\s+time|brick\s+by\s+brick)\b/gi, severity: "medium", category: "language", label: "Platitude rhythm closer", explanation: "Stock inspirational rhythm-closer that signals 'motivational post ending'.", fix: "Close on a specific action the reader can take, not a rhythmic platitude." },
  { pattern: /\b(nothing\s+but\s+a\s+(dream|vision|laptop|idea)|with\s+nothing\s+but\s+)/gi, severity: "high", category: "language", label: "Origin-story filler", explanation: "'Walked in with nothing but a dream' — the cornerstone of LinkedIn origin-story posts.", fix: "Describe what you specifically had and didn't have. 'I had $4,000 and zero customers' beats 'nothing but a dream'." },
  { pattern: /\b(stop\s+waiting\s+for\s+permission|don'?t\s+wait\s+for\s+permission)\b/gi, severity: "medium", category: "language", label: "Stop-waiting-for-permission cliché", explanation: "LinkedIn career-advice staple — performative boldness.", fix: "Describe the specific permission structure you bypassed or the specific action you took." },
  { pattern: /\b(start\s+before\s+you'?re\s+ready|begin\s+before\s+you\s+feel\s+ready)\b/gi, severity: "medium", category: "language", label: "Start-before-you're-ready cliché", explanation: "LinkedIn advice-platitude — evergreen motivational filler.", fix: "Name the specific fear or delay you'd push through. 'Ship the first version before you've chosen a name' beats 'start before you're ready'." },
  { pattern: /\b(hire\s+people\s+smarter\s+than\s+you|surround\s+yourself\s+with\s+people\s+smarter)\b/gi, severity: "medium", category: "language", label: "Hire-smarter-than-you cliché", explanation: "Top-5 LinkedIn wisdom-platitude — repeated by every founder's ghostwriter.", fix: "Describe the specific hire or skill gap. 'Our second hire was a CRM engineer who'd run retention at Klarna' beats the platitude." },
  { pattern: /\b(trust\s+the\s+process|embrace\s+the\s+process|the\s+process\s+works)\b/gi, severity: "medium", category: "language", label: "Trust-the-process cliché", explanation: "Sports-movie quote recycled as thought-leadership.", fix: "Describe the specific process. 'Weekly retros where we ship only one thing' beats 'trust the process'." },
  { pattern: /\b(celebrate\s+(small|tiny|the\s+small)\s+wins|small\s+wins\s+compound)\b/gi, severity: "medium", category: "language", label: "Celebrate-small-wins cliché", explanation: "Listicle-bullet staple — zero operational content.", fix: "Describe the specific ritual. 'We post every shipped PR to a #wins Slack channel' beats the platitude." },
  { pattern: /\b(which\s+(one\s+)?resonates\s+(with\s+you)?|which\s+one\s+hits\s+hardest|which\s+is\s+your\s+favorite)\s*\??/gi, severity: "medium", category: "language", label: "Engagement-bait closer", explanation: "'Which resonates?' — algorithmic engagement bait at the end of a LinkedIn post.", fix: "Cut the bait. If you want specific engagement, ask a specific question." },
  { pattern: /\b(dive\s+into|diving\s+into|dives\s+into)\s+(the\s+)?(world|realm|art|science)\s+of\b/gi, severity: "high", category: "language", label: "Dive-into-the-world-of opener", explanation: "Blog-post template opener that immediately announces generic writing.", fix: "Open with the specific claim or story, not the meta-announcement of a deep-dive." },
  { pattern: /\bunlock\s+the\s+secrets?\s+(that|of|to)\b/gi, severity: "high", category: "language", label: "Unlock-the-secrets cliché", explanation: "'Unlock the secrets that top brands use' — pure content-marketing filler.", fix: "Just describe what the brands do. Skip the 'secrets' frame." },

  // ═══════════════════════════════════════════════════════════════════
  // AI TEMPLATE-PROSE TELLS — the subtle connectives and framings
  // ═══════════════════════════════════════════════════════════════════
  { pattern: /\b(when|while)\s+thinking\s+about\s+\w+/gi, severity: "medium", category: "language", label: "When-thinking-about opener", explanation: "Generic framing opener — template preamble before the actual thought.", fix: "State the thought directly. 'Onboarding succeeds when…' beats 'When thinking about onboarding…'." },
  { pattern: /\bseamless(ly)?\b/gi, severity: "low", category: "language", label: "Seamlessly adverb", explanation: "'Seamlessly' is AI's favorite adverb — signals polish without describing it.", fix: "Describe what specifically is frictionless. Or cut the adverb." },
  { pattern: /\bquietly\b/gi, severity: "medium", category: "language", label: "Quietly (AI understatement tell)", explanation: "'Quietly' as in 'quietly became the standard' or 'quietly reshaping the industry' is a signature AI understatement adverb — it manufactures false subtlety and profundity around an ordinary claim. The only legitimate use is describing literal volume (a quiet voice, a quiet room).", fix: "Cut it, or state the change plainly. 'Reached a point' beats 'quietly reached a point'. Keep 'quietly' only when you literally mean low sound or volume." },
  { pattern: /\b(key\s+elements?\s+include|key\s+(features?|components?|factors?)\s+include)\b/gi, severity: "medium", category: "structure", label: "Key-elements-include preamble", explanation: "Bullet-list preamble that announces the writer is about to structure their thought.", fix: "Just list the elements as prose, or use a plain header." },
  { pattern: /\bclear\s+calls?-to-action\b/gi, severity: "low", category: "language", label: "Clear-CTA jargon", explanation: "UX-deck filler phrase — 'clear calls-to-action' is default marketing-site advice.", fix: "Name the specific button copy or the specific intent. 'Upgrade to Pro' beats 'clear call-to-action'." },
  { pattern: /\b(reduced\s+friction|reducing\s+friction|frictionless\s+(experience|flow|journey))\b/gi, severity: "low", category: "language", label: "Friction jargon", explanation: "UX/product-marketing stock phrase.", fix: "Name the specific step you removed. 'Skip phone-number on signup' beats 'reduced friction'." },
  { pattern: /\bpersonali[sz]ed\s+(touchpoints?|experiences?|recommendations?|journeys?)\b/gi, severity: "medium", category: "language", label: "Personalized-touchpoints cliché", explanation: "Martech-deck filler — every tool claims 'personalized touchpoints'.", fix: "Name the specific personalization. '3-segment dynamic hero' beats 'personalized touchpoints'." },
  { pattern: /\bby\s+focusing\s+on\s+(these|the)\s+(fundamentals?|basics|essentials|core\s+principles?)\b/gi, severity: "medium", category: "language", label: "Focusing-on-fundamentals closer", explanation: "Closing-paragraph template that waves at a conclusion without naming one.", fix: "Name the specific next step or the specific insight. Cut the pointing-back frame." },
  { pattern: /\b(significantly|substantially|dramatically)\s+(improve|increase|boost|enhance|reduce|decrease|accelerate)\b/gi, severity: "low", category: "language", label: "Significantly-improve cliché", explanation: "'Significantly improve X' — vague adverb + generic verb = AI copy tell.", fix: "Give the actual number. '12% lift in activation' beats 'significantly improve activation'." },
  { pattern: /\b(plays?\s+an?\s+(key|crucial|vital|important|major|critical)\s+role)\b/gi, severity: "medium", category: "language", label: "Plays-a-key-role filler", explanation: "Generic attribution phrase — signals importance without naming mechanism.", fix: "Describe the specific mechanism. 'Engagement signals decide Gmail tab placement' beats 'engagement signals play a key role'." },
  { pattern: /\b(yields?\s+(the\s+)?best\s+results|produces?\s+(the\s+)?best\s+outcomes|delivers?\s+(the\s+)?best\s+results)\b/gi, severity: "medium", category: "language", label: "Yields-best-results cliché", explanation: "Closing-paragraph filler that restates 'this works well' without specifics.", fix: "Name the specific result. 'Double-digit lift in reply rate' beats 'yields the best results'." },

  // ═══════════════════════════════════════════════════════════════════
  // ORIGIN-STORY / THREAD-BRO PATTERNS
  // ═══════════════════════════════════════════════════════════════════
  { pattern: /\b(\d+|ten|twelve|fifteen|twenty)\s+years\s+ago,?\s+I\s+\w+/gi, severity: "medium", category: "language", label: "X-years-ago-I opener", explanation: "'Ten years ago, I walked into X with nothing but…' — LinkedIn origin-story opener.", fix: "Lead with the present-tense claim you're making. Skip the timeline setup." },
  { pattern: /\btoday,?\s+I\s+(lead|run|own|manage|oversee)\s+\w+/gi, severity: "medium", category: "language", label: "Today-I-lead transition", explanation: "Origin-story second beat — pairs with 'X years ago I walked in' opener.", fix: "State the outcome or current role without the before/after journey arc." },
  { pattern: /\bhere'?s\s+what\s+(changed\s+everything|I\s+(learned|figured\s+out|discovered)|no\s+one\s+(tells|told)\s+you)\b/gi, severity: "medium", category: "language", label: "Here's-what-changed-everything opener", explanation: "Thread-reveal opener — announces a reveal instead of just making it.", fix: "Lead with the specific insight. Skip the 'what I learned' frame." },
  { pattern: /(^|\n)\s*\d+[\/.]?\s+[A-Z]\w+\s+\w+/gm, severity: "low", category: "structure", label: "Slash-numbered thread bullets", explanation: "'1/ Stop waiting for permission  2/ Start before you're ready' — LinkedIn thread-bullet format.", fix: "Write the list as prose paragraphs, or at least drop the slash. The format itself signals template." },

  // Repeated sentence openings (detected separately via analysis)
];

// ────────────────────────────────────────────────────────────────────
// Skeleton matcher — fuzzy phrase detection
//
// Exact regex matches are brittle. "You'll grow faster than you
// thought possible" fires; "You'll grow faster than was possible"
// does not, even though they're the same LinkedIn closer in every
// way that matters.
//
// A skeleton is an ORDERED sequence of required tokens plus an
// allowed GAP between each. We tokenize input text, walk through
// looking for the skeleton's tokens in order (within the gap
// budget), and report a match if ≥ threshold of the tokens are
// found contiguously.
//
// Skeletons handle synonyms via groups: a token can be a single
// word OR a "|"-separated alternation ("grow|learn|improve").
// Wildcard slots ("__") match any single token.
//
// This lets one skeleton catch dozens of phrasings. The library
// below is deliberately broad — when in doubt, add it; false
// positives on natural writing are rare because the thresholds
// require most of the skeleton to match.
// ────────────────────────────────────────────────────────────────────

/** Token-level skeleton library. ~50 patterns covering the LinkedIn
 *  / thought-leadership dialect where variants proliferate. Each
 *  skeleton catches every phrasing of its pattern, not just one. */
const SKELETONS = [
  // Growth / motivational closers
  { id: "grow-faster-than-possible", tokens: ["you'll|you|you're", "grow|learn|improve|progress|advance|develop|move|scale|rise", "faster|quicker|further|more|higher|bigger", "than", "possible|thought|imagined|expected|believed"], severity: "high", category: "language", label: "Motivational growth closer", explanation: "Every variant of 'you'll grow faster than X possible' is a LinkedIn evergreen sign-off.", fix: "Close with what you'd actually tell someone considering the move. Cut the platitude." },
  { id: "take-it-youll-thank", tokens: ["take", "it", "you'll|you", "thank"], severity: "medium", category: "language", label: "Take-it-you'll-thank-me closer", explanation: "'Take it. You'll thank yourself later' family — LinkedIn advice-giver trope.", fix: "Say the specific reason to take the opportunity. Cut the predicted gratitude." },

  // Thread-narrative bridges
  { id: "im-starting-to-see", tokens: ["i'm|im|i", "starting|beginning|coming", "see|notice|realise|realize", "world|pattern|shape"], severity: "high", category: "language", label: "LinkedIn thread hook", explanation: "'I'm starting to see a world where…' — viral-thread opening every AI post uses.", fix: "Lead with the observation itself." },
  { id: "keep-coming-back-to", tokens: ["i|what", "keep|keeps", "coming", "back", "to"], severity: "medium", category: "language", label: "Returning-to-this opener", explanation: "'The part I keep coming back to is X' — setup for a generic observation.", fix: "State the observation directly." },
  { id: "the-thing-that-stands", tokens: ["the", "thing|part", "that|which", "stands|matters|strikes|hits"], severity: "medium", category: "language", label: "Pointing-phrase opener", explanation: "'The thing that stands out most is…' — LinkedIn-voice preamble.", fix: "State the observation directly." },

  // Hedge-feeling
  { id: "feels-like-something", tokens: ["feels|feel", "like|very", "__", "new|different|real|big|right|important"], severity: "medium", category: "language", label: "Hedge-feeling phrase", explanation: "'Feels like a new thing' / 'feels very real' — hedging a claim behind a feeling.", fix: "State the fact. Cut the feels." },
  { id: "it-feels-like-moment", tokens: ["it|this", "feels|felt", "like", "one|a", "moment"], severity: "medium", category: "language", label: "Moment-of-inflection trope", explanation: "'It feels like one of those moments' — stock LinkedIn inflection-point framing.", fix: "Either it is that moment (name why) or it isn't (cut)." },
  { id: "shift-changes-role", tokens: ["that|this", "shift|change", "changes|is", "role|job|work"], severity: "medium", category: "language", label: "Shift-changes-the-role trope", explanation: "'That shift changes the role of the operator' — stock thought-leadership line.", fix: "Name the specific change in specific terms." },

  // Future-of-work
  { id: "shape-of-work", tokens: ["shape|nature|face|future", "of", "work|things|__"], severity: "high", category: "language", label: "LinkedIn trope phrase", explanation: "'The shape of work / future of work / nature of things' — stock thought-leadership phrasing.", fix: "Describe the specific change with specific examples." },
  { id: "what-good-looks-like", tokens: ["what", "good|great|excellent", "looks|means|is", "like"], severity: "high", category: "language", label: "What-good-looks-like trope", explanation: "'What good looks like in the role' is MBA-adjacent filler.", fix: "Describe the actual standard, with an example." },

  // Human-vs-AI tropes
  { id: "still-needs-human", tokens: ["still|really", "needs|requires|demands", "human", "touch|element|hand|eye|judgment|judgement"], severity: "medium", category: "language", label: "Human-touch cliché", explanation: "'That still needs a human touch' — most overused AI-vs-human line.", fix: "Name the specific thing a human brings that AI doesn't." },
  { id: "ai-changes-speed", tokens: ["ai|tooling|agents", "changes|has\\s+changed|is\\s+changing", "speed|pace"], severity: "medium", category: "language", label: "AI-changes-the-speed trope", explanation: "Stock observation about pace acceleration.", fix: "Describe the specific timing change with numbers." },
  { id: "ai-helps-but-craft", tokens: ["__", "has|is|been", "huge|massive|incredible|invaluable", "asset|help|resource"], severity: "medium", category: "language", label: "Praise-filler noun phrase", explanation: "'X has been a huge asset' — generic praise that doesn't name what's valuable.", fix: "Describe the specific thing it helped with." },

  // Startup platitudes
  { id: "no-such-thing-my-job", tokens: ["no", "such", "thing", "as|like", "not", "my", "job"], severity: "medium", category: "language", label: "Startup platitude", explanation: "'No such thing as 'that's not my job'' — startup-culture filler.", fix: "Describe the specific boundary crossing." },
  { id: "wear-many-hats", tokens: ["wear|wearing", "many|lots", "hats|roles"], severity: "medium", category: "language", label: "Wear-many-hats cliché", explanation: "Stock startup self-description.", fix: "Name the specific roles. 'I do design, copywriting, and product research' beats 'I wear many hats'." },
  { id: "blank-canvas-to", tokens: ["from|a", "blank|empty", "canvas|page|sheet", "to"], severity: "medium", category: "language", label: "Journey-opener trope", explanation: "'From a blank canvas to…' — stock LinkedIn project reveal.", fix: "Start with the actual work or outcome." },
  { id: "zero-to-one", tokens: ["from|a", "zero", "to", "one|live|launched|shipped"], severity: "medium", category: "language", label: "Zero-to-one trope", explanation: "'From zero to one / zero to live' — overused journey marker.", fix: "Describe the actual first version." },

  // Teaching/learning parallel
  { id: "x-teaches-you-y", tokens: ["__", "teaches|shows|reveals", "you", "how|what", "to"], severity: "low", category: "structure", label: "Parallel-teaching pattern", explanation: "'Marketing teaches you how to X / Product teaches you how to Y' — LinkedIn parallel-lesson structure.", fix: "Make the distinction without the parallel frame." },
  { id: "turns-out-not-different", tokens: ["turns", "out", "__", "not|aren't|isn't|aren\\'t", "that|so|very"], severity: "medium", category: "language", label: "Thread-punchline pattern", explanation: "'Turns out X and Y aren't that different' — LinkedIn reveal-line.", fix: "State the actual relationship with specifics." },

  // Abstract-noun-sits-there family
  { id: "abstract-sits-there", tokens: ["judgement|judgment|taste|standards|wisdom|intuition|experience|craft|nuance", "sits|lives|stays"], severity: "high", category: "structure", label: "Abstract-noun-sits-there trope", explanation: "'Judgement sits there / lives there' — signature AI LinkedIn pattern.", fix: "Rewrite with concrete verbs. 'Judgement decides what ships.'" },

  // Closer tropes
  { id: "specific-kind-of-comes-from", tokens: ["there's|there|this|that", "a", "specific|particular|certain|peculiar|unique", "kind|type|sort|flavour|flavor|breed", "of", "__", "that", "comes|arrives|begins|grows|emerges|happens|exists"], threshold: 0.85, severity: "high", category: "language", label: "Specific-kind-of-X opener", explanation: "Viral 2025–26 emotional-essay template — 'There's a specific kind of [feeling] that comes from [cause]'. Catches every variant of the pattern.", fix: "Name the feeling and its specific cause directly. Cut the framing." },
  { id: "start-of-something", tokens: ["the|a", "start|beginning", "of", "something"], severity: "high", category: "language", label: "Start-of-something closer", explanation: "'The start of something real/big' — stock LinkedIn sign-off.", fix: "Close on a specific commitment or observation." },
  { id: "watch-this-space", tokens: ["watch|keep\\s+an\\s+eye", "this", "space"], severity: "medium", category: "language", label: "Watch-this-space closer", explanation: "Corporate-comms sign-off with no information content.", fix: "Name what's coming next and when. Or cut." },
  { id: "more-to-come", tokens: ["more|lots", "to", "come|follow|share"], severity: "low", category: "language", label: "More-to-come closer", explanation: "Placeholder closer used when there's nothing specific to end on.", fix: "Either close with the specific next step, or just stop the post." },
  { id: "exciting-times-ahead", tokens: ["exciting|interesting|big", "times|days|things", "ahead"], severity: "medium", category: "language", label: "Exciting-times-ahead closer", explanation: "Corporate-optimism filler.", fix: "Name a specific thing that's coming." },

  // Opener tropes
  { id: "happy-to-share", tokens: ["happy|thrilled|excited|proud", "to", "finally|now|today", "share|announce|reveal"], severity: "low", category: "language", label: "Excited-to-share opener", explanation: "Default LinkedIn project-reveal opener.", fix: "Lead with what you shipped, not how you feel about shipping it." },
  { id: "over-last-weeks", tokens: ["over|in", "the|last", "last|past|few", "weeks|months|days"], severity: "low", category: "language", label: "Time-marker opener", explanation: "'Over the last few weeks I've been…' — default LinkedIn preamble.", fix: "Lead with what you did, not when." },
  { id: "x-has-always-been", tokens: ["__", "has|have", "always", "been", "__"], severity: "low", category: "language", label: "Always-been trope", explanation: "'X has always been Y' — sets up a generic pivot.", fix: "Start with the present claim. Skip the historical setup unless it adds information." },

  // Rhetorical scaffolding
  { id: "heres-the-thing", tokens: ["here's|here|this", "the", "thing|truth|reality|secret"], severity: "medium", category: "language", label: "Here's-the-thing opener", explanation: "'Here's the thing / here's the truth' — performative wisdom framing.", fix: "Just state the thing." },
  { id: "let-me-tell-you", tokens: ["let", "me", "tell|share", "you"], severity: "medium", category: "language", label: "Let-me-tell-you opener", explanation: "Thread-bro telegraph: 'let me tell you / let me share what I learned'.", fix: "Tell. Don't announce the telling." },
  { id: "that-got-me-thinking", tokens: ["got|had", "me|us", "thinking|wondering|questioning"], severity: "low", category: "language", label: "Reflection-prompt opener", explanation: "'That got me thinking about X' — generic pivot into a take.", fix: "Skip the prompt. Just make the take." },

  // Value-claim fillers
  { id: "makes-big-difference", tokens: ["makes|make", "a|the", "big|huge|real|massive", "difference"], severity: "low", category: "language", label: "Makes-a-big-difference filler", explanation: "Vague positive claim with no content.", fix: "Describe the specific outcome or behaviour." },
  { id: "next-level-everything", tokens: ["takes|taking|take", "it|things|everything", "to", "next|another", "level"], severity: "medium", category: "language", label: "Next-level cliché", explanation: "Overused upgrade phrase with no specifics.", fix: "Name the specific improvement and its magnitude." },
  { id: "game-changer", tokens: ["game", "changer|changing|changer\\."], severity: "high", category: "language", label: "Game-changer cliché", explanation: "Flagship LinkedIn cliché. Signals AI-drafted enthusiasm.", fix: "Name the specific behaviour or outcome that changed." },
  { id: "level-up", tokens: ["level|leveling", "up|up\\s+our|up\\s+your"], severity: "medium", category: "language", label: "Level-up cliché", explanation: "Gamified-growth filler.", fix: "Name the actual capability being improved." },

  // "Personal" tropes
  { id: "personal-to-me", tokens: ["this|that", "is|feels", "personal", "to", "me"], severity: "medium", category: "language", label: "Personal-to-me flourish", explanation: "'That part feels personal to me' — manufactured-vulnerability pattern.", fix: "If it's genuinely personal, explain why with specifics." },
  { id: "that-hit-different", tokens: ["that|this|it", "hit|hits", "different|differently|home|hard"], severity: "medium", category: "language", label: "Hit-different trope", explanation: "Gen-Z-flavour emotion claim used as filler.", fix: "Describe what specifically was powerful about it." },
  { id: "lessons-learned", tokens: ["top|key|main", "lessons|learnings|takeaways|takeouts"], severity: "low", category: "language", label: "Lessons-learned list-header", explanation: "'Top 5 lessons learned…' — default LinkedIn listicle header.", fix: "Lead with the lesson itself." },

  // Team/company self-description
  { id: "we-are-moving-fast", tokens: ["we|we're", "are|are\\s+really|really", "moving|shipping|building", "fast|quickly|quick"], severity: "low", category: "language", label: "We-move-fast filler", explanation: "Generic startup self-description.", fix: "Specify cadence. 'We ship a feature every Friday' beats 'we move fast'." },
  { id: "small-but-mighty", tokens: ["small|lean", "but|and", "mighty|scrappy|driven|hungry"], severity: "medium", category: "language", label: "Small-but-mighty cliché", explanation: "Stock team self-characterisation.", fix: "Cut the characterisation. Let the work speak." },
  { id: "in-the-trenches", tokens: ["in", "the", "trenches|weeds|field"], severity: "medium", category: "language", label: "In-the-trenches cliché", explanation: "War/struggle metaphor for doing normal work.", fix: "Describe the actual work. 'Writing Liquid' beats 'in the trenches'." },

  // AI-era specific
  { id: "ai-agents-coordinate", tokens: ["coordinate|orchestrate|manage", "__", "agents|models|systems"], severity: "medium", category: "language", label: "AI-orchestration filler", explanation: "Stock 'I coordinate agents' phrasing of the AI era.", fix: "Describe what the agents actually do and what coordination means here." },
  { id: "reshape-the-role", tokens: ["reshape|reshapes|reshape|redefine", "__", "role|job|work|field"], severity: "medium", category: "language", label: "Reshape-the-role trope", explanation: "'AI will reshape the role of X' — stock futures talk.", fix: "Name the specific redefinition. What's different about the role now?" },
  { id: "the-shape-is-changing", tokens: ["shape|shape\\s+of", "is", "changing|shifting|evolving"], severity: "medium", category: "language", label: "The-shape-is-changing trope", explanation: "Vague inflection-point framing.", fix: "Describe the specific shift. What was the shape? What is it becoming?" },

  // MBA / career-journey patterns
  { id: "this-is-your-sign", tokens: ["this|here", "is", "your", "sign", "to"], threshold: 1, severity: "high", category: "language", label: "LinkedIn CTA cliché", explanation: "'This is your sign to…' is the most overused LinkedIn CTA.", fix: "Make the actual request. Cut the 'sign'." },
  { id: "if-youve-ever-wondered", tokens: ["if", "you|you've", "ever", "wondered|thought|considered|asked"], severity: "medium", category: "language", label: "If-you've-ever-wondered opener", explanation: "Generic hypothetical hook.", fix: "Address the specific reader you're trying to reach." },
  { id: "opens-doors-never", tokens: ["opened|opens|opening", "doors|door", "never|didn't", "expected|imagined|thought"], severity: "medium", category: "language", label: "Opens-doors cliché", explanation: "'Opened doors I never expected' — LinkedIn-journey stock phrase.", fix: "Name the specific opportunity." },
  { id: "found-my-footing", tokens: ["find|found|finding", "my|your|his|her|their", "footing|feet|way"], severity: "low", category: "language", label: "Find-your-footing metaphor", explanation: "Stock transition-phase cliché.", fix: "Describe what you were specifically doing to reorient." },
  { id: "along-the-way-i-found", tokens: ["along", "the", "way", "i|we", "found|discovered|learned|gained|built"], severity: "medium", category: "language", label: "Along-the-way reflection", explanation: "Stock LinkedIn reflection opener.", fix: "Describe what you found without the journey-frame." },
  { id: "cut-through-noise-hesitation", tokens: ["cut", "through", "__", "hesitation|noise|doubt|clutter|confusion|uncertainty"], severity: "medium", category: "language", label: "Cut-through-the-X trope", explanation: "'Advice cut through my hesitation' AI-narrative metaphor.", fix: "Describe what the advice actually said, not its rhetorical effect." },
  { id: "imposter-syndrome-dose", tokens: ["healthy|case", "dose|of|of\\s+case", "imposter|impostor", "syndrome"], severity: "medium", category: "language", label: "Imposter-syndrome cliché", explanation: "Overused self-deprecating LinkedIn trope.", fix: "Describe the specific doubt or moment." },
  { id: "that-feeling-shifted", tokens: ["that|the", "feeling", "shifted|changed|started|flipped"], severity: "medium", category: "language", label: "Feeling-shifted trope", explanation: "'That feeling shifted' — stock narrative pivot.", fix: "Describe what specifically changed." },
  { id: "confidence-community-perspective", tokens: ["found|gained|built", "confidence|community|clarity|purpose|perspective", "community|clarity|purpose|perspective|voice|belonging", "perspective|voice|belonging|purpose"], severity: "high", category: "structure", label: "Abstract-triplet discovery", explanation: "'I found confidence, community, and a new perspective' — AI rule-of-three abstract-noun list.", fix: "Pick the one that matters most. Describe it concretely." },
  { id: "changed-my-life", tokens: ["changed|changes|would\\s+change", "my|our", "life|lives"], threshold: 1, severity: "medium", category: "language", label: "Changed-my-life cliché", explanation: "Most overused LinkedIn-transformation closer.", fix: "Describe the specific change." },

  // "I remember thinking" narrative devices
  { id: "i-remember-thinking", tokens: ["i", "remember", "thinking|wondering|telling"], severity: "low", category: "language", label: "I-remember-thinking narrative device", explanation: "Stock LinkedIn first-person-anecdote pivot.", fix: "Describe the moment directly without the memory-frame." },
  { id: "walking-into-that-room", tokens: ["walking|walked", "into|in", "__", "room|class|office|building"], severity: "low", category: "language", label: "Walking-into-the-room opener", explanation: "Narrative-setup cliché for memory posts.", fix: "Start with what happened, not with the walk." },

  // "Never-been-more" inflation
  { id: "never-been-more", tokens: ["never|couldn't", "been|be", "more", "excited|proud|grateful|ready|sure|certain"], severity: "medium", category: "language", label: "Never-been-more-X superlative", explanation: "LinkedIn emotion-inflation phrase.", fix: "Scale the claim back to something believable." },

  // CTAs with emoji arrow
  { id: "register-here-arrow", tokens: ["register|sign|apply|book|join", "here|now", "__"], severity: "low", category: "language", label: "Register-here CTA with pointer", explanation: "LinkedIn CTA line followed by an emoji pointer — stock event-promotion format.", fix: "Either the copy above the link earns the click, or it doesn't. Pointer emojis don't rescue weak CTAs." },
];

/** Tokenize a string into lowercase words, stripping punctuation. */
function tokenizeForSkeleton(text) {
  return text
    .toLowerCase()
    .split(/[\s\.,;:!?()[\]"“”]+/)
    .map((t) => t.replace(/[^a-z0-9'’\-]/g, ""))
    .filter(Boolean);
}

/** Check whether one input token satisfies a skeleton token (which
 *  may be an alternation "a|b|c" or the wildcard "__"). */
function tokenMatches(input, target) {
  if (target === "__") return true;
  if (target.includes("|")) {
    return target.split("|").some((alt) => alt === input || alt === input.replace(/['’]/g, ""));
  }
  if (target === input) return true;
  // Normalise curly/straight apostrophes for matching
  if (target.replace(/['’]/g, "") === input.replace(/['’]/g, "")) return true;
  return false;
}

/** Greedy skeleton match: walk the input looking for skeleton tokens
 *  in order, allowing up to gapMax gap tokens between each. Returns
 *  match ratio (0..1) and the first-match index for reporting. */
function matchSkeletonInText(
  inputTokens,
  skeleton
) {
  const gapMax = skeleton.gapMax ?? 4;
  let bestRatio = 0;
  let bestStart = -1;
  let bestMatched = [];

  // Try starting at each position (not just the first match) —
  // catches cases where the skeleton appears deeper in the text.
  for (let start = 0; start < inputTokens.length; start++) {
    let cursor = start;
    let matched = 0;
    const matchedWords = [];
    let skeletonIndex = 0;
    let aborted = false;
    while (skeletonIndex < skeleton.tokens.length && cursor < inputTokens.length) {
      const target = skeleton.tokens[skeletonIndex];
      let gap = 0;
      let found = false;
      while (cursor < inputTokens.length && gap <= gapMax) {
        if (tokenMatches(inputTokens[cursor], target)) {
          found = true;
          matched++;
          matchedWords.push(inputTokens[cursor]);
          cursor++;
          skeletonIndex++;
          break;
        }
        cursor++;
        gap++;
      }
      if (!found) {
        aborted = true;
        break;
      }
    }
    const ratio = matched / skeleton.tokens.length;
    if (!aborted && ratio > bestRatio) {
      bestRatio = ratio;
      bestStart = start;
      bestMatched = matchedWords;
      if (ratio === 1) break; // can't improve
    }
  }
  return { ratio: bestRatio, startIndex: bestStart, matchedTokens: bestMatched };
}

// ────────────────────────────────────────────────────────────────────
// Feature-based structural analysis
//
// Phrase rules catch specific turns of phrase. Structural analysis
// catches AI-drafting RHYTHMS — patterns that persist even when the
// wording changes. Five structural signals:
//
//   1. Anaphoric runs: 3+ consecutive sentences starting with the
//      same word ("They can X. They can Y. They can Z.")
//   2. Fragment ratio: share of "sentences" under 5 words — the
//      performative-punch tic
//   3. Single-sentence paragraph ratio: LinkedIn-rhythm tell
//   4. Opening entropy: Shannon entropy of sentence-opening words
//   5. Hedge density: hedging phrases per 100 words
//
// Plus a compound-signal penalty: when 4+ structural signals fire
// together in one text, that combination itself is a strong AI tell
// and gets an additional deduction.
// ────────────────────────────────────────────────────────────────────

/** Hedge phrases — soft commitment language. Separate from the phrase
 *  rules because we care about DENSITY, not individual matches. */
const HEDGE_RE =
  /\b(feels?\s+like|feels?\s+(very\s+)?(real|personal|meaningful|important|right|different)|kind\s+of|sort\s+of|probably|seems?\s+to|appears?\s+to|in\s+a\s+way|somewhat|fairly\s+(clear|obvious)|maybe|perhaps|I\s+think|I\s+believe|I\s+guess|I\s+suppose|starting\s+to\s+feel|really\s+starting\s+to)\b/gi;

/** Ornamental emoji regex — captures common LinkedIn/thread-bro sign-off
 *  and CTA emojis used as decoration. Not an exhaustive Unicode set;
 *  covers the patterns that signal AI-drafted thought-leadership posts.
 *  Added 👉 (pointer), 🙏 (gratitude), 💡 (light bulb), 💭 (thought),
 *  🌟 (star), 🎯 (target) — all common LinkedIn CTA / bullet emojis. */
const DECORATIVE_EMOJI_RE =
  /[\u{2728}\u{1F680}\u{1F4AA}\u{1F64C}\u{1F525}\u{1F4AF}\u{26A1}\u{1F916}\u{1F60C}\u{1F389}\u{1F44F}\u{1F914}\u{1F31F}\u{1F449}\u{1F448}\u{1F64F}\u{1F4A1}\u{1F4AD}\u{1F31F}\u{1F3AF}\u{2B50}\u{1F9E0}]/gu;

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Find anaphoric runs — consecutive sentences starting with the
 * same first word. Returns every run of length >= 3.
 */
function findAnaphoricRuns(
  sentences
) {
  const runs = [];
  let currentPrefix = "";
  let currentCount = 0;
  let currentStart = 0;

  for (let i = 0; i <= sentences.length; i++) {
    const firstWord =
      i < sentences.length ? sentences[i].split(/\s+/)[0]?.toLowerCase() ?? "" : "";
    // Strip common punctuation from the first word
    const normalized = firstWord.replace(/[^a-z'’]/g, "");
    if (normalized && normalized === currentPrefix) {
      currentCount++;
    } else {
      if (currentCount >= 3) {
        runs.push({ prefix: currentPrefix, count: currentCount, startIdx: currentStart });
      }
      currentPrefix = normalized;
      currentCount = 1;
      currentStart = i;
    }
  }
  return runs;
}

/**
 * Find consecutive sentences that share the same verb-object pattern
 * with different subjects. Catches rhetorical patterns like:
 *   "Marketing teaches you how to talk to people."
 *   "Product teaches you how to build for them."
 * where the anaphora detector misses because the first words differ.
 *
 * Heuristic: compare consecutive sentence pairs. If tokens 2..4 are
 * identical between pair[0] and pair[1] (after lowercasing, stripping
 * punctuation), and the first tokens differ, that's a parallel
 * predicate. Tokens 2..4 generally span verb + first object words.
 */
function findParallelPredicates(
  sentences
) {
  const pairs = [];
  const normalizeWord = (w) => w.toLowerCase().replace(/[^a-z'’]/g, "");
  const getTokens = (s) =>
    s
      .split(/\s+/)
      .map(normalizeWord)
      .filter(Boolean);

  for (let i = 0; i < sentences.length - 1; i++) {
    const a = getTokens(sentences[i]);
    const b = getTokens(sentences[i + 1]);
    if (a.length < 4 || b.length < 4) continue;
    // Different first tokens (different subjects)
    if (a[0] === b[0]) continue;
    // Same 2nd and 3rd tokens (same verb + following object/particle)
    // — that's the parallel predicate signature.
    if (a[1] === b[1] && a[2] === b[2]) {
      pairs.push({
        a: sentences[i].trim(),
        b: sentences[i + 1].trim(),
        sharedTail: `${a[1]} ${a[2]}`,
      });
    }
  }
  return pairs;
}

/** Shannon entropy of lowercase first words of each sentence. */
function openingEntropy(sentences) {
  const openers = [];
  for (const s of sentences) {
    const first = s.split(/\s+/)[0]?.toLowerCase().replace(/[^a-z'’]/g, "") ?? "";
    if (first) openers.push(first);
  }
  if (openers.length === 0) return 0;
  const counts = new Map();
  for (const o of openers) counts.set(o, (counts.get(o) ?? 0) + 1);
  let entropy = 0;
  for (const c of counts.values()) {
    const p = c / openers.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

/**
 * Run heuristic slop detection on raw text. Combines phrase-rule
 * matching with feature-based structural analysis — see the header
 * comment above for the full list of signals.
 *
 * Returns a structured analysis the UI renders without further logic.
 */
export function analyseSlop(raw) {
  const text = (raw ?? "").trim();
  const findings = [];

  // Basic stats
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const sentences = splitSentences(text);
  const sentenceCount = sentences.length;
  const avgSentenceLength = sentenceCount === 0 ? 0 : wordCount / sentenceCount;
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0);

  // ── Phrase-rule matches (existing) ─────────────────────────────
  for (const rule of PHRASE_RULES) {
    const matches = text.match(rule.pattern);
    if (!matches || matches.length === 0) continue;
    const unique = Array.from(new Set(matches.map((m) => m.trim())));
    findings.push({
      category: rule.category,
      severity: rule.severity,
      label: rule.label,
      explanation: rule.explanation,
      matches: unique.slice(0, 5),
      fix: rule.fix,
    });
  }

  // ── Skeleton matching (fuzzy phrase detection) ─────────────────
  // Catches variants the regex rules miss. Thresholded so a partial
  // skeleton match (typically 75%) still fires — that's the whole
  // point of the skeleton matcher. Deduped against phrase-rule
  // findings by label so we don't double-penalise the same issue.
  const phraseLabels = new Set(findings.map((f) => f.label));
  const skeletonTokens = tokenizeForSkeleton(text);
  for (const skel of SKELETONS) {
    if (phraseLabels.has(skel.label)) continue;
    const threshold = skel.threshold ?? 0.75;
    const match = matchSkeletonInText(skeletonTokens, skel);
    if (match.ratio >= threshold) {
      findings.push({
        category: skel.category,
        severity: skel.severity,
        label: skel.label,
        explanation: skel.explanation,
        matches: [`${Math.round(match.ratio * 100)}% match: "${match.matchedTokens.join(" ")}"`],
        fix: skel.fix,
      });
    }
  }

  // ── Structural signal 1: anaphoric runs ────────────────────────
  // 3 consecutive anaphoric sentences is medium. 4+ is high. When the
  // prefix is a LinkedIn-signature word ("it's", "we", "you", "this"),
  // we escalate severity — those repetitions are the textbook slop pattern.
  if (sentenceCount >= 3) {
    const runs = findAnaphoricRuns(sentences);
    const SIGNATURE_PREFIXES = new Set(["its", "it", "we", "you", "this", "that", "the", "and"]);
    for (const run of runs) {
      const isSignaturePrefix = SIGNATURE_PREFIXES.has(run.prefix.replace(/['’]/g, ""));
      const severity =
        run.count >= 4 ? "high" :
        run.count >= 3 && isSignaturePrefix ? "high" :
        "medium";
      findings.push({
        category: "structure",
        severity,
        label: "Anaphoric parallelism",
        explanation:
          `${run.count} consecutive sentences start with "${run.prefix}" — parallelism imposed by rule rather than earned by the content. Signature AI-drafting pattern.`,
        matches: [`${run.count}× "${run.prefix}..."`],
        fix: "Vary the opening. Merge parallel sentences into one, or restructure so the rhythm comes from meaning, not the subject repeating.",
      });
    }
  }

  // ── Structural signal 2: fragment-heavy rhythm ─────────────────
  if (sentenceCount >= 6) {
    const shortSentences = sentences.filter(
      (s) => s.split(/\s+/).filter(Boolean).length <= 4
    );
    const fragmentRatio = shortSentences.length / sentenceCount;
    if (fragmentRatio >= 0.3) {
      findings.push({
        category: "structure",
        severity: fragmentRatio >= 0.5 ? "high" : "medium",
        label: "Fragment-heavy rhythm",
        explanation:
          `${shortSentences.length} of ${sentenceCount} sentences (${Math.round(fragmentRatio * 100)}%) are 4 words or fewer. Performative-punchy fragmentation is an AI-drafting tic.`,
        matches: shortSentences.slice(0, 4).map((s) => `"${s.trim()}"`),
        fix: "Merge fragments into complete sentences. Reserve one-word sentences for moments of real emphasis.",
      });
    }
  }

  // ── Structural signal 3: LinkedIn paragraph rhythm ─────────────
  if (paragraphs.length >= 6) {
    const singleSentence = paragraphs.filter(
      (p) => splitSentences(p).length === 1
    ).length;
    const ratio = singleSentence / paragraphs.length;
    if (ratio >= 0.7) {
      findings.push({
        category: "structure",
        severity: "high",
        label: "LinkedIn-rhythm paragraphs",
        explanation:
          `${singleSentence} of ${paragraphs.length} paragraphs (${Math.round(ratio * 100)}%) are single-sentence. This paragraph-per-beat rhythm is the single clearest signal of AI-drafted LinkedIn content.`,
        fix: "Write in real paragraphs — 2–5 sentences grouped by idea. Single-sentence paragraphs should be rare and carry a deliberate beat.",
      });
    }
  }

  // ── Structural signal 4: opening entropy ───────────────────────
  if (sentenceCount >= 8) {
    const entropy = openingEntropy(sentences);
    if (entropy < 2.0) {
      findings.push({
        category: "structure",
        severity: entropy < 1.3 ? "high" : "medium",
        label: "Low opening variety",
        explanation:
          `Sentence openings are highly repetitive (entropy ${entropy.toFixed(2)} across ${sentenceCount} sentences). Natural prose varies more; AI writing reuses a small set of openers.`,
        fix: "Rework sentences so the first word changes meaningfully across the piece — especially near consecutive sentences.",
      });
    }
  }

  // ── Structural signal 5: hedge density ─────────────────────────
  if (wordCount >= 60) {
    const hedgeMatches = text.match(HEDGE_RE) ?? [];
    const per100 = (hedgeMatches.length / wordCount) * 100;
    if (per100 >= 1.5) {
      findings.push({
        category: "language",
        severity: per100 >= 2.5 ? "high" : "medium",
        label: "Hedge-heavy prose",
        explanation:
          `${hedgeMatches.length} hedging phrases across ${wordCount} words (${per100.toFixed(1)} per 100). Hedging at that density is AI-drafting evasion of commitment.`,
        matches: Array.from(new Set(hedgeMatches.map((m) => m.toLowerCase()))).slice(0, 5),
        fix: "Commit to each claim or cut it. If you're genuinely uncertain, name the specific uncertainty.",
      });
    }
  }

  // ── Decorative emoji usage ─────────────────────────────────────
  // Multiple decorative emojis anywhere: clear signal.
  // A single decorative emoji within the last 80 characters of the
  // piece (i.e. at the end, used as a sign-off marker): lower-severity
  // signal but still worth flagging, since that's exactly the AI-
  // LinkedIn closing-flourish pattern.
  const emojiMatches = Array.from(text.matchAll(DECORATIVE_EMOJI_RE));
  if (emojiMatches.length >= 2) {
    findings.push({
      category: "language",
      severity: emojiMatches.length >= 4 ? "medium" : "low",
      label: "Decorative emoji pattern",
      explanation:
        `${emojiMatches.length} decorative emojis (sparkles, rockets, flexed arm, etc.). Ornamental emoji use is a strong LinkedIn-voice / AI-drafting signal.`,
      matches: Array.from(new Set(emojiMatches.map((m) => m[0]))).slice(0, 5),
      fix: "Cut ornamental emojis. Keep them only when the emoji itself carries meaning the text can't.",
    });
  } else if (emojiMatches.length === 1) {
    // Check whether that single emoji sits in the last 80 chars — the
    // classic sign-off position. If yes, still signal it (low severity).
    const lastEmoji = emojiMatches[emojiMatches.length - 1];
    const pos = (lastEmoji.index ?? 0);
    if (pos >= text.length - 80) {
      // Motivational-flourish emojis (🙌💯✨🚀🔥👇💪) at the end of a post
      // are the canonical LinkedIn sign-off — escalate to medium severity.
      const LINKEDIN_SIGNOFF_EMOJI = /[\u{1F64C}\u{1F4AF}\u{2728}\u{1F680}\u{1F525}\u{1F447}\u{1F4AA}]/u;
      const isSignatureEmoji = LINKEDIN_SIGNOFF_EMOJI.test(lastEmoji[0]);
      findings.push({
        category: "language",
        severity: isSignatureEmoji ? "medium" : "low",
        label: "Decorative emoji sign-off",
        explanation:
          `Single ornamental emoji (${lastEmoji[0]}) in the closing position — the LinkedIn-style motivational flourish.`,
        matches: [lastEmoji[0]],
        fix: "Either the final line earns its close without the emoji or it doesn't. Don't lean on the emoji.",
      });
    }
  }

  // ── Parallel-predicate pairs (same verb, different subjects) ───
  // Catches rhetorical patterns like:
  //   "Marketing teaches you how to talk to people."
  //   "Product teaches you how to build for them."
  // where the anaphora detector misses because the FIRST words differ,
  // but the structure is clearly parallel by verb + object.
  if (sentenceCount >= 2) {
    const parallelPairs = findParallelPredicates(sentences);
    if (parallelPairs.length >= 1) {
      findings.push({
        category: "structure",
        severity: parallelPairs.length >= 2 ? "medium" : "low",
        label: "Parallel-predicate structure",
        explanation:
          `${parallelPairs.length} pair(s) of sentences share the same verb+object pattern with different subjects — rhetorical parallelism imposed by template rather than earned by the content.`,
        matches: parallelPairs
          .slice(0, 2)
          .map((p) => `"${p.a}" / "${p.b}"`),
        fix: "Collapse the pair into one sentence, or rewrite so the parallelism isn't the structural load-bearer.",
      });
    }
  }

  // ── Flat sentence rhythm (kept from v1) ────────────────────────
  if (sentenceCount >= 6) {
    const deviations = sentences.map((s) =>
      Math.abs(s.split(/\s+/).filter(Boolean).length - avgSentenceLength)
    );
    const avgDev = deviations.reduce((a, b) => a + b, 0) / deviations.length;
    if (avgDev < 3 && avgSentenceLength >= 15) {
      findings.push({
        category: "structure",
        severity: "low",
        label: "Flat sentence rhythm",
        explanation:
          "Every sentence is roughly the same length. Good prose mixes short declaratives with longer structured sentences.",
        fix: "Break up a few long sentences with short emphatic ones — or merge consecutive short sentences into one complex one.",
      });
    }
  }

  // ── Three-bullet symmetry (kept from v1) ───────────────────────
  const bulletMatches = text.match(/(^|\n)\s*[-*•]\s+/g);
  if (bulletMatches && bulletMatches.length === 3) {
    findings.push({
      category: "structure",
      severity: "low",
      label: "Suspiciously symmetric list",
      explanation:
        "Exactly three bullets is the AI default. Ask whether the topic actually has three items or whether you cut corners.",
      fix: "If the point genuinely has three parts, keep it. If it has two or four, say so instead of forcing a round number.",
    });
  }

  // ── Emoji-prefixed bullet list ─────────────────────────────────
  // The ✍️ / 🧠 / 📊 / 🔎 LinkedIn-tool-list format. A strong AI
  // formatting tell — real humans rarely reach for themed emojis
  // to organise a list.
  const emojiBulletPattern =
    /(^|\n)\s*([\u{1F300}-\u{1F9FF}\u{2600}-\u{27BF}\u{2700}-\u{27BF}\u{1F000}-\u{1F2FF}]\uFE0F?)\s+\w/gu;
  const emojiBullets = Array.from(text.matchAll(emojiBulletPattern));
  if (emojiBullets.length >= 3) {
    findings.push({
      category: "structure",
      severity: "high",
      label: "Emoji-prefixed bullet list",
      explanation:
        `${emojiBullets.length} lines begin with a themed emoji (✍️/🧠/📊/🔎 pattern). Classic LinkedIn/AI formatting for "here are the N things I'm doing" lists.`,
      matches: emojiBullets.slice(0, 4).map((m) => m[0].trim()),
      fix: "Cut the emojis and write the list as prose, or use plain hyphen bullets. Themed emojis signal a template, not content.",
    });
  }

  // ── Anaphoric paragraph openers (paragraph-level, not sentence) ─
  // Catches "Often in synergy. Often one speaking to the other…"
  // / "Here, ownership sits close… Here, we ship fast…" patterns
  // where 3+ paragraphs OR consecutive sentences share an opener
  // word that isn't typically used this way ("Often", "Here",
  // "Now").
  if (paragraphs.length >= 3) {
    const paragraphOpeners = paragraphs
      .map((p) => (p.trim().split(/\s+/)[0] ?? "").toLowerCase().replace(/[^a-z']/g, ""));
    const openerCounts = new Map();
    for (const o of paragraphOpeners) {
      if (!o) continue;
      openerCounts.set(o, (openerCounts.get(o) ?? 0) + 1);
    }
    // Flag unusual repeated openers (not conversational words like
    // "i", "the", "a" — those are naturally common).
    const unusualRepeats = Array.from(openerCounts.entries()).filter(
      ([o, c]) =>
        c >= 3 &&
        !["i", "the", "a", "and", "but", "it", "we", "my"].includes(o)
    );
    if (unusualRepeats.length > 0) {
      findings.push({
        category: "structure",
        severity: "medium",
        label: "Anaphoric paragraph openers",
        explanation:
          `Multiple paragraphs start with the same unusual word (${unusualRepeats.map(([o, c]) => `"${o}" ×${c}`).join(", ")}). Parallel paragraph openers is a LinkedIn-template tell.`,
        matches: unusualRepeats.slice(0, 3).map(([o, c]) => `"${o}..." × ${c}`),
        fix: "Vary the paragraph opener. Parallel structure imposed across paragraphs reads as formulaic rather than intentional.",
      });
    }
  }

  // ── Compound connective-density signal ─────────────────────────
  // When 3+ AI-connective findings fire (Empty authority, Generic closer,
  // Transition spam, Qualifying filler, Vague qualifier), the DENSITY of
  // connectives — not the individual phrases — is the real slop signal.
  const CONNECTIVE_LABELS = new Set([
    "Empty authority phrase",
    "Generic closer",
    "Transition spam",
    "Qualifying filler",
    "Vague qualifier",
    "Padded phrase",
    "End-of-day filler",
  ]);
  const connectiveCount = findings.filter((f) => CONNECTIVE_LABELS.has(f.label)).length;
  if (connectiveCount >= 3) {
    findings.push({
      category: "structure",
      severity: "high",
      label: "AI-connective density",
      explanation:
        `${connectiveCount} AI-template connective phrases in a single passage. Density itself is the tell — real writing doesn't need 'moreover' + 'that said' + 'ultimately' to make a point.`,
      fix: "Cut the connectives. Let the sentences stand next to each other without announcing the transition.",
    });
  }

  // ── Compound structural penalty ────────────────────────────────
  // When 4+ structural signals fire in the same text, the combination
  // itself is a powerful AI-tell beyond the individual deductions.
  const structuralSignals = findings.filter(
    (f) => f.category === "structure"
  ).length;
  if (structuralSignals >= 4) {
    findings.push({
      category: "structure",
      severity: "high",
      label: "Compound LinkedIn-voice pattern",
      explanation:
        `${structuralSignals} independent structural AI-drafting signals fire in this text. The combination is a stronger indicator than any single signal — the piece is in the wrong register throughout.`,
      fix: "Rewrite from the thesis, not from the existing prose. Individual edits won't recover the voice — decide what you actually want to say and say it.",
    });
  }

  // ── Score ──────────────────────────────────────────────────────
  let score = 100;
  for (const f of findings) {
    if (f.severity === "high") score -= 9;
    else if (f.severity === "medium") score -= 5;
    else score -= 2;
  }
  // Very-short content bias: trivially short content (<15 words) can't
  // reliably accumulate enough findings to distinguish slop from signal,
  // so we apply a protective floor. But short marketing copy (15-40 words)
  // is exactly where slop density is HIGHEST — product taglines, hero
  // text, landing-page intros — so we let those score freely.
  //
  // Exception: if the text is 15-40 words AND fires fewer than 2
  // high-severity findings, we apply a gentler floor (60) to avoid
  // over-punishing mildly-flawed short prose.
  if (wordCount > 0 && wordCount < 15) {
    score = Math.max(score, 75);
  } else if (wordCount >= 15 && wordCount < 40) {
    const highSeverityCount = findings.filter((f) => f.severity === "high").length;
    if (highSeverityCount < 2) {
      score = Math.max(score, 60);
    }
  }
  if (wordCount === 0) score = 0;
  score = Math.max(0, Math.min(100, score));

  const tier =
    score >= 85 ? "sharp" :
    score >= 70 ? "decent" :
    score >= 50 ? "generic" :
                  "slop";

  return {
    score,
    tier,
    wordCount,
    sentenceCount,
    avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
    findings,
    rewritePrompt: buildRewritePrompt(text, findings),
  };
}

/**
 * Build a copy-paste prompt the user can drop into Claude to get a
 * rewrite that applies the anti-slop-editor skill's principles.
 * Keeping this prompt in sync with the skill file's behaviour is
 * important — if one drifts, the user's expectations split.
 */
function buildRewritePrompt(text, findings) {
  const issues = findings.slice(0, 5).map((f) => `- ${f.label}: ${f.explanation}`).join("\n");
  return `You are the anti-slop-editor skill from Orbit. Rewrite the following content to remove AI-slop patterns. Do not pause for approval — apply the strongest reasonable improvements directly.

Editorial principles: specificity over generality, compression over padding, concrete examples over abstractions, prioritisation over flat balance, voice over sterile polish. Cut anything that adds no meaning. Preserve the author's intent and factual claims — do not invent statistics, quotes, or case studies.

${findings.length > 0 ? `Issues detected in the draft:\n${issues}\n\n` : ""}Draft to rewrite:\n---\n${text}\n---\n\nReturn only the rewritten version. No commentary.`;
}

/**
 * Gate a piece of content before it leaves an MCPB tool. Returns the
 * original text wrapped in quality metadata so tools can surface the
 * score + findings alongside the output.
 *   - mode "warn" (default): attach analysis to the response.
 *   - mode "block": throw SLOP_GATE_BLOCK if tier is "slop".
 */
export function gateContent(text, { mode = "warn", label = "content" } = {}) {
  const analysis = analyseSlop(text);
  if (mode === "block" && analysis.tier === "slop") {
    const issues = analysis.findings
      .filter((f) => f.severity === "high")
      .slice(0, 3)
      .map((f) => `- ${f.label}: ${f.explanation}`)
      .join("\n");
    const err = new Error(
      `Slop gate rejected ${label} (score ${analysis.score}/100, tier "${analysis.tier}").\n\n${issues}\n\nRevise and retry.`
    );
    err.code = "SLOP_GATE_BLOCK";
    err.analysis = analysis;
    throw err;
  }
  return {
    text,
    quality: {
      score: analysis.score,
      tier: analysis.tier,
      wordCount: analysis.wordCount,
      findings: analysis.findings.map((f) => ({
        severity: f.severity,
        label: f.label,
        explanation: f.explanation,
        fix: f.fix,
        matches: f.matches,
      })),
      rewriteAvailable: analysis.findings.length > 0,
    },
  };
}

export function gateContentBundle(fields, { mode = "warn" } = {}) {
  const out = {};
  const summary = { minScore: 100, worstTier: "sharp", blockedFields: [] };
  const rank = { sharp: 0, decent: 1, generic: 2, slop: 3 };
  for (const [label, text] of Object.entries(fields)) {
    if (text === null || text === undefined) continue;
    const str = String(text);
    if (!str.trim()) continue;
    try {
      out[label] = gateContent(str, { mode, label });
      if (out[label].quality.score < summary.minScore) {
        summary.minScore = out[label].quality.score;
      }
      if (rank[out[label].quality.tier] > rank[summary.worstTier]) {
        summary.worstTier = out[label].quality.tier;
      }
    } catch (err) {
      summary.blockedFields.push({ field: label, reason: err.message });
      if (mode === "block") throw err;
    }
  }
  return { fields: out, summary };
}
