# Changelog

## [0.30.0](https://github.com/cgoinglove/thursday-agent/compare/thursday-agent-v0.29.0...thursday-agent-v0.30.0) (2026-10-06)


### Features

* **bots:** what a bot keeps for itself is shown, from the disk, and Undo puts it back ([05eed45](https://github.com/cgoinglove/thursday-agent/commit/05eed450c0f437804c783f8fdb5fa538b50ab27d))
* **reach:** a voice message from the phone is read as words by the transcription model picked ([0ca84d2](https://github.com/cgoinglove/thursday-agent/commit/0ca84d2e7fdf579741ffbe243f0816f0d4bb4f8b))
* **room:** Stop all stops every thread at work, from the room or by asking her ([555c156](https://github.com/cgoinglove/thursday-agent/commit/555c156c919bb1adc091de23506e6620c3cb57fe))
* **routines:** a routine its bot watches opens a run only when what it waits on changes ([7cbbe9a](https://github.com/cgoinglove/thursday-agent/commit/7cbbe9a5ce70865701472f294c4916c3e700f9f8))
* **routines:** Settings › Routines shows what a routine watches, and Stop watching ([fe5d6d7](https://github.com/cgoinglove/thursday-agent/commit/fe5d6d794722e301592592dd9c0fd7f3072be871))


### Fixes

* **bots:** a lesson is cleared by age with the jobs, its record only ([135d20a](https://github.com/cgoinglove/thursday-agent/commit/135d20a6316462eeff777b002fc9962745bfaf28))
* **bots:** a lesson keeps only what its job changed, and Undo keeps to it ([af4d659](https://github.com/cgoinglove/thursday-agent/commit/af4d6597cb1daac66d839a901a6327eea9998826))
* **reach:** an audio file sent on Telegram reaches her as a file ([678ed0e](https://github.com/cgoinglove/thursday-agent/commit/678ed0ee2d8d68f6091b798cbb49baff3a9cc645))
* **routines:** a watch decides only between repeated starts of the job it was written for ([00a2377](https://github.com/cgoinglove/thursday-agent/commit/00a2377a6219c73938a0de54ed32e8e57270353e))
* **workbench:** a checkout's key is hidden again, and Undo names every file it could not restore ([05ab00f](https://github.com/cgoinglove/thursday-agent/commit/05ab00fa795e9767668bec15992923f04657f892))
* **workbench:** a shell hides real secrets only, read once until one changes ([9e5c970](https://github.com/cgoinglove/thursday-agent/commit/9e5c97015a318d6c69907188f4978d0eeecba223))
* **workbench:** what a shell prints hides the secrets the app keeps ([7c6775e](https://github.com/cgoinglove/thursday-agent/commit/7c6775e55ac97baa29deca9bc3677661c6780969))

## [0.29.0](https://github.com/cgoinglove/thursday-agent/compare/thursday-agent-v0.28.0...thursday-agent-v0.29.0) (2026-10-05)


### Features

* **prompts:** enhance live and thursday prompts with job bot integration ([ff009d0](https://github.com/cgoinglove/thursday-agent/commit/ff009d070a764472f64ef0ab5c0db5ba20b04cb8))


### Fixes

* **call:** a bot starts only on a yes to a proposal naming the bot and the request ([3cfacc4](https://github.com/cgoinglove/thursday-agent/commit/3cfacc4be270586a06e5f1128a4d4da35364f795))

## [0.28.0](https://github.com/cgoinglove/thursday-agent/compare/thursday-agent-v0.27.0...thursday-agent-v0.28.0) (2026-10-01)


### Features

* **memory:** a spoken call is read once after it ends, for what the user said about themselves ([02db351](https://github.com/cgoinglove/thursday-agent/commit/02db351bc882515c384ac490d91fb59a0c1f61d6))


### Fixes

* **call:** the voice is no longer asked to hand over what the user says about themselves ([a104426](https://github.com/cgoinglove/thursday-agent/commit/a104426a2c036aebe2216e21a8e88643639f0742))
* **call:** what the user says about themselves leads the voice's delegation policy, to go at once ([5e257b6](https://github.com/cgoinglove/thursday-agent/commit/5e257b67fe40fdfc7adb6b41802a2799d886b427))


### Docs

* **call:** the delegation comment cites the commits as they are on main ([ce6e9f4](https://github.com/cgoinglove/thursday-agent/commit/ce6e9f485d6ee4889a73149b13689f487ac0188a))

## [0.27.0](https://github.com/cgoinglove/thursday-agent/compare/thursday-agent-v0.26.0...thursday-agent-v0.27.0) (2026-10-01)


### Features

* **bots:** a bot looks back once a job is done and keeps what it learned about working ([d3a374f](https://github.com/cgoinglove/thursday-agent/commit/d3a374fd21e683bed546c08ae3b2c5f16ee958e6))
* **bots:** a bot reads how the user wants things done in its instructions ([a2bcf8d](https://github.com/cgoinglove/thursday-agent/commit/a2bcf8d79b30e9bc8a5cf982c8c2a61c000ec4bf))
* **bots:** a bot stands alone at its desk on its page, turned to the front ([dbc62b0](https://github.com/cgoinglove/thursday-agent/commit/dbc62b026088a79237e5a14ecf8c5810eff93c94))
* **bots:** a bot's page opens on the bot at its desk, as the office draws it ([cce6577](https://github.com/cgoinglove/thursday-agent/commit/cce657735223b7a72ed3f65b8705b0bff7e9f3f8))
* **cli:** a start says what it is doing, and the address to open is the last thing on the screen ([f5df97f](https://github.com/cgoinglove/thursday-agent/commit/f5df97f75a6be40d1764f90783890545d3d56225))
* **intro:** the first run asks five things, not six: what bots think with is left to Settings ([15693d0](https://github.com/cgoinglove/thursday-agent/commit/15693d0a88f6ced0c4fe67d4dbaeda7bf9068e7d))


### Fixes

* **a11y:** a finished job is announced without a period after its label ([976c0dd](https://github.com/cgoinglove/thursday-agent/commit/976c0dd4779c488f0c41e20be95f387bc1e4c3cd))
* **a11y:** a screen reader hears her answer once she has finished it, and a job that ended ([320e3bc](https://github.com/cgoinglove/thursday-agent/commit/320e3bcf00386c8398b8453320cdd9cecec414c0))
* **a11y:** a segmented switch moves with the arrows, and Settings' titles are headings ([e9d13bd](https://github.com/cgoinglove/thursday-agent/commit/e9d13bddea83860797585f5a51b5585308286cab))
* **a11y:** closing the write line, a thread or the room gives the keyboard's focus back ([0c43349](https://github.com/cgoinglove/thursday-agent/commit/0c43349ba1f7dcf55ea82a1bf0544116e7e63ac6))
* **a11y:** Settings' rail is one tab stop, the section open, and says which it is ([149528d](https://github.com/cgoinglove/thursday-agent/commit/149528d9bb726fa19a5f36585619ee9fe5e1a34c))
* **a11y:** small grey text clears 4.5:1, her face shows the keyboard's ring, and less motion holds her still ([4bb2497](https://github.com/cgoinglove/thursday-agent/commit/4bb24978f33bb270f865cea88ebb58aaa305c057))
* **a11y:** the call screen is the page's main landmark, under a heading of its own ([26e808d](https://github.com/cgoinglove/thursday-agent/commit/26e808d573b5667ab2fdac82b1b39eb4fc972d42))
* **browser:** a bot reaches their own Chrome through its extension, and attaches again when that drops ([f389364](https://github.com/cgoinglove/thursday-agent/commit/f389364edf19480c2eb58deb3e45f113213925f0))
* **browser:** a job's hidden browsers close when it is done, idle an hour, or the server stops ([c9e0cda](https://github.com/cgoinglove/thursday-agent/commit/c9e0cdab26c07e241fa02ae0ca9609fb03bc3b9b))
* **browser:** a waiting job's hidden browsers are looked at every five minutes, not on the hourly sweep ([3a30d27](https://github.com/cgoinglove/thursday-agent/commit/3a30d276b3b68a6b1ebf46b451051b3faa410287))
* **call:** a call in writing that hears nothing from the model for two minutes says so ([20d09ea](https://github.com/cgoinglove/thursday-agent/commit/20d09eac64082d77ffff68eba0d1c2b39e85d995))
* **call:** a call the plan refuses says why, and names memory grown past what a call can carry ([3a4815c](https://github.com/cgoinglove/thursday-agent/commit/3a4815c33a2922346e0e3d7f053b40a670628be6))
* **call:** a name the user gives on a spoken call is handed over to be kept ([275ad4e](https://github.com/cgoinglove/thursday-agent/commit/275ad4e6aaea79a7d9991615ce50c4ee707e70c3))
* **corner:** on a call the finished cards fold to the newest and one line ([14f7050](https://github.com/cgoinglove/thursday-agent/commit/14f7050c85a8e7d62ead9a8e157bcacb64d3db69))
* **dialog:** a confirm with long words keeps its buttons on the screen ([cb0f1e2](https://github.com/cgoinglove/thursday-agent/commit/cb0f1e29c58308f870ec2a64b57197a8694c4f30))
* **document:** a document says the language it is written in, so its page reads in it ([d856ae4](https://github.com/cgoinglove/thursday-agent/commit/d856ae4663621fbcfb959c09e2089acbb03466d4))
* **files:** a file up to 25 MB arrives, and one past it is refused before it is sent ([e95d524](https://github.com/cgoinglove/thursday-agent/commit/e95d524ae78c8dfba513982a685b692604072883))
* **intro:** in a narrow window the first run's steps scroll to their Continue ([9f0795a](https://github.com/cgoinglove/thursday-agent/commit/9f0795a84c87987da5115d427d43d0a2e0ebac1e))
* **markdown:** a bot's link to its own file opens it, rather than reading "[blocked]" ([f82b06b](https://github.com/cgoinglove/thursday-agent/commit/f82b06b0f550b1b0b75c42c22babe37e06525b73))
* **marks:** a face at rest keeps its eyes open and blinks, drawing only as it does ([7030996](https://github.com/cgoinglove/thursday-agent/commit/7030996de71356ab856def02aa15f3e68eea7a39))
* **memory:** an edit with no model picked says so, and Send opens the picker ([7c856a6](https://github.com/cgoinglove/thursday-agent/commit/7c856a6826d9386735316034a78ef36fb7fdcdde))
* **room:** a progress note refused on its way to Thursday says to end the turn, not to ask ([67faab0](https://github.com/cgoinglove/thursday-agent/commit/67faab0e3f4c8b8c304b28616da203be85156416))


### Performance

* **files:** a tile draws its page or text once it nears the screen ([2d3a147](https://github.com/cgoinglove/thursday-agent/commit/2d3a147449255afec3bd374333bfd5c64940c6b2))
* **inbox:** the room's list carries the newest 20 unread endings, and a routine's row hears its run end ([f1ece7d](https://github.com/cgoinglove/thursday-agent/commit/f1ece7d358cb5a0af1cd1eaeefb5568bf1d3b3f3))
* **marks:** bots' faces show the team as the screen opens, then sleep; the pill shows only who is at work ([6a261e9](https://github.com/cgoinglove/thursday-agent/commit/6a261e9e047cc969e57a166d973b323841ec379a))
* **marks:** bots' faces under Settings stop drawing, as hers does ([ff0f0ad](https://github.com/cgoinglove/thursday-agent/commit/ff0f0aded42a983a2a8a27450e05fb2bff6d9f21))
* **threads:** Settings › Threads searches on the server, so a word nothing matches costs one request ([0d5d070](https://github.com/cgoinglove/thursday-agent/commit/0d5d0704d5d1bac926fc3c55eb1ce7c42dfced0d))


### Under the hood

* **intro:** drop what the removed models step left: AccountsSetup and its comment ([34904ff](https://github.com/cgoinglove/thursday-agent/commit/34904ffb2eae09075c7076130b8062e1c474a843))


### Docs

* **artifact:** HTML in a document leaves its colours to the page ([4f0dfd6](https://github.com/cgoinglove/thursday-agent/commit/4f0dfd6baac5b44753f19c7eed805b2e4726dbc6))
* the maintainer's picks on the theme and on faces at rest, and bots' look back in the tour ([004e697](https://github.com/cgoinglove/thursday-agent/commit/004e697221611265405d063763a4515ff546e74c))

## [0.26.0](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.25.0...thursday-agent-v0.26.0) (2026-09-30)


### Features

* **update:** a newer version is said as the app opens, and Update moves the background copy to it ([2bd57af](https://github.com/cgoinglove/thursday/commit/2bd57afc882cf8d14ba6e2e9eb2cf5d75810a1df))


### Fixes

* **bots:** opening a note no longer costs a bot the cache of its thread ([8c817ad](https://github.com/cgoinglove/thursday/commit/8c817ad5f877c6998aa8fc6a5a224febc86a0acb))
* **bots:** the memory switch goes back when its write fails ([c28ac1c](https://github.com/cgoinglove/thursday/commit/c28ac1c4ca8d9b71c8a3f7866fc1e5e415b21d0d))
* **call:** a refused microphone is named as one, and a blocked wake word can be tried again ([640d578](https://github.com/cgoinglove/thursday/commit/640d57839fb9e736044f512004a5db0f97183e6b))
* **call:** a tool result too large for the line no longer leaves the turn hanging ([c815df7](https://github.com/cgoinglove/thursday/commit/c815df7621e727f23c88fa68547a7990c64285eb))
* **call:** the microphone stops at the hang-up, not at its confirmation ([d408bea](https://github.com/cgoinglove/thursday/commit/d408bea0283adde7797dcf45cb760c66d08b68cf))
* **call:** where they are no longer drops out of a call once it has been found ([485ba72](https://github.com/cgoinglove/thursday/commit/485ba7279cf383598cb1bd6b9a48ea75924f8023))
* **connectors:** a server whose read failed says so in its dialog ([042c162](https://github.com/cgoinglove/thursday/commit/042c162d31969db99c140702c9ad9e3287069734))
* **jobs:** clearing finished threads lists the browsers once, and a failed list closes nothing ([96a7043](https://github.com/cgoinglove/thursday/commit/96a7043535813f2e78325020ff4fa6d467f33963))
* **mcp:** a session whose connection is gone is dropped, not kept for the idle wait ([e4a2440](https://github.com/cgoinglove/thursday/commit/e4a244054ab697f824d5df6323aed72392af9d67))
* **memory:** an edit that was refused gives the instruction back ([8afe96a](https://github.com/cgoinglove/thursday/commit/8afe96ab6a62bb473c30172ef7926bc6be2a8969))
* **reach:** a stranger's signature cannot hold her mailbox shut ([23b26af](https://github.com/cgoinglove/thursday/commit/23b26af2cb4be10db8cc11acbdd87b0056586181))
* **reach:** an answer made words of once is not cut a second time ([0de55bb](https://github.com/cgoinglove/thursday/commit/0de55bb80de28b21bccd6051f22240ec793045fb))
* **reach:** forgetting who may write stops the turn that is answering them ([3303c10](https://github.com/cgoinglove/thursday/commit/3303c1078242ea9af08e58609ae00c06f3843c6d))
* **reach:** open work is not sent to the phone twice ([f5f071f](https://github.com/cgoinglove/thursday/commit/f5f071f5234097fcb923cd4fb4f4712a0d4c2198))
* **room:** files put down beside a thread's draft are no longer lost ([45587d8](https://github.com/cgoinglove/thursday/commit/45587d8327b7d7525200369598fac5212118b416))
* **routine:** a run the app has to stop ends instead of waiting on Continue ([a9e4af4](https://github.com/cgoinglove/thursday/commit/a9e4af4e48af49e21abd81a339259758466f2da7))
* **sandbox:** a command's output is folded as it arrives, not held whole ([65d1b99](https://github.com/cgoinglove/thursday/commit/65d1b9949c47e7a770ca296f5d4681a9876ce6ff))
* **signins:** a kept sign-in survives a write that fails ([1d00ee9](https://github.com/cgoinglove/thursday/commit/1d00ee9f3aea2b8252aa6e7b7a3f998168e02387))
* **update:** a second failed update is said again, and the card no longer says the old one runs when nothing answers ([4085ea1](https://github.com/cgoinglove/thursday/commit/4085ea12f975979a65cbd9a79e83dd8c445b6b9e))
* **update:** the card goes while Settings is open, and a tab left on the old version loads again ([9f0abf7](https://github.com/cgoinglove/thursday/commit/9f0abf772e249a10a1356a200755aac7971267cf))
* **update:** the notice is a square card under the settings corner, not a toast ([1fe6637](https://github.com/cgoinglove/thursday/commit/1fe6637d53267b6fd910023488316e87ef9df2ee))
* **update:** the update command starts from the home folder, not from the copy it replaces ([775818e](https://github.com/cgoinglove/thursday/commit/775818e8a32e6ab2c86802470e99057d95fc2e7e))


### Performance

* **bundle:** zod's locales no longer ship to the home page ([8af5cea](https://github.com/cgoinglove/thursday/commit/8af5ceae5b81ccd0e666579ecf37e29579223e88))
* **call:** a call no longer waits on where they are; the page looks it up ahead ([fbd3176](https://github.com/cgoinglove/thursday/commit/fbd3176c2a32bcc4e16a6add9bfec90cd734a203))
* **call:** opening a call no longer reads ten transcripts to use none ([99538c7](https://github.com/cgoinglove/thursday/commit/99538c7eab5a81afdba90b3f54b85d6274aec052))
* **face:** she stops drawing while Settings covers her ([256b4ab](https://github.com/cgoinglove/thursday/commit/256b4abf80ffb5494fecef84eb63074052a58b4b))
* **reach:** mail from someone who may not write is no longer fetched to find that out ([400c7a0](https://github.com/cgoinglove/thursday/commit/400c7a0f830194cd295f11627ecdee9615fdaabb))
* **room:** an opened tool result is not read again for every row a bot writes ([040002e](https://github.com/cgoinglove/thursday/commit/040002ec7c923f5cfe109404ca3b152692b9a577))


### Docs

* **maps:** the jobs map says a stop made outside pauseRoom strands a routine ([614db31](https://github.com/cgoinglove/thursday/commit/614db31e932b5fada56e379769ce2c3821b6a713))
* **taste:** the pick for how a newer version is said ([9b18306](https://github.com/cgoinglove/thursday/commit/9b1830625c0c8b2b4327cae742914c98ad5723e6))

## [0.25.0](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.24.0...thursday-agent-v0.25.0) (2026-09-30)


### Features

* **reach:** a bot reads a site's mail at Thursday's own address ([ef4b1fd](https://github.com/cgoinglove/thursday/commit/ef4b1fdb4e5cc9ce6c9337f4aacfdc0f4cc7fc6b))
* **reach:** Thursday can be emailed, at a mailbox of her own ([e5a6eb2](https://github.com/cgoinglove/thursday/commit/e5a6eb2add70c9b4a163325a58e6f619836bb14b))


### Fixes

* **favicon:** a site that could not be asked is asked again ([ea09059](https://github.com/cgoinglove/thursday/commit/ea0905913dc657970dc486bd4217aab63f4c4c20))
* **reach:** a mail's subject reaches her named as one ([7da431d](https://github.com/cgoinglove/thursday/commit/7da431d78f184e912c87f1b4f63255ff09488a25))
* **reach:** a network change no longer loses the user's mail ([855c128](https://github.com/cgoinglove/thursday/commit/855c128dd978c41500d54ae393523f5653e9af19))
* **reach:** holding a mail for DNS is bounded, cheap and said as what it is ([0f90ae4](https://github.com/cgoinglove/thursday/commit/0f90ae4b28b42100af09c07ca7ba20edc07f6de3))
* **reach:** the email review's ten findings ([10886aa](https://github.com/cgoinglove/thursday/commit/10886aa76c3ac869a8599a3ad88125c1ab6daf18))


### Docs

* **maps:** the call map says take checks unproven first, and a named channel answers only the named person ([dc4522b](https://github.com/cgoinglove/thursday/commit/dc4522b7a2ce3d9f192905e4afc0b6d1d209c544))
* **readme:** the office section shows a job finishing, as a moving picture ([6e86960](https://github.com/cgoinglove/thursday/commit/6e86960dbe8a3a1d38c0fbbb84ebecceab89aae8))

## [0.24.0](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.23.0...thursday-agent-v0.24.0) (2026-09-30)


### Features

* **bot:** the office says how its job stands beside its name, keeps its time on a scoreboard, and its desks show who works and who is done ([387de45](https://github.com/cgoinglove/thursday/commit/387de455319a4f5032b9ee70c886d02e3db0353b))
* **models:** Claude Sonnet 5.5 replaces Sonnet 5 ([#62](https://github.com/cgoinglove/thursday/issues/62)) ([1bcba38](https://github.com/cgoinglove/thursday/commit/1bcba388a1500c203a474871e1772d60e57fac6e))
* **models:** GPT-6.1 Sol replaces GPT-6 Sol ([341f6a0](https://github.com/cgoinglove/thursday/commit/341f6a0ccbe82975d345882f69d385daf9a74b46))


### Fixes

* **bot:** a job handed over from the screen is named by up to 120 characters of its message, not its first four words ([9c98387](https://github.com/cgoinglove/thursday/commit/9c98387527b6feb323ef632afdfd8f28ff962182))
* **bot:** the office opens at 70% rather than 50% ([ab924b9](https://github.com/cgoinglove/thursday/commit/ab924b93b7996469fe094626deca57dceb4b0b93))
* **bot:** the office's rings, cards, words and zoom finish what they start, and a desk lights only once its bot is there ([c9b3a9e](https://github.com/cgoinglove/thursday/commit/c9b3a9ec96a6a2071e4d3fe41f8ee8e32c6d258c))
* **deps:** package.json takes the ai-sdk ranges the lockfile already records ([840278c](https://github.com/cgoinglove/thursday/commit/840278c52b3fef8bf2befcffeeb4ef4940c38f64))


### Performance

* **ui:** the markdown renderer loads apart from the first screen, so opening the app no longer stalls on it ([#65](https://github.com/cgoinglove/thursday/issues/65)) ([018cf75](https://github.com/cgoinglove/thursday/commit/018cf752dcc5c386ed613b8c39be7ad49c5c56db))


### Docs

* **bot:** a thread's label is also the user's own words when handed over from the screen ([0964bf0](https://github.com/cgoinglove/thursday/commit/0964bf0d1e72ff0b4a6d3a43518295f3242c501e))
* **chatgpt:** why the plan's sign-in stays on the Codex client ([df53b22](https://github.com/cgoinglove/thursday/commit/df53b2247151632f4ee683cffecf1d3a8f84d5c0))
* **maps:** the call map names what breaks in putting down and in the plan's tool calls, and says the rest once ([c87239e](https://github.com/cgoinglove/thursday/commit/c87239efc23a6adc2f5e5e67a927c9a39be0b6a5))
* **readme:** the hero is the office at work, and a section shows a job drawn as an office ([b8c0eee](https://github.com/cgoinglove/thursday/commit/b8c0eeedbfc038c7a7076932e8704ede1008cc57))
* **readme:** the hero says she is a voice assistant, shows her words over the office and its scoreboard, and gives the install command as a button ([e51d1f0](https://github.com/cgoinglove/thursday/commit/e51d1f0af8109904dd9141e6259ecb136370e3cd))

## [0.23.0](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.22.0...thursday-agent-v0.23.0) (2026-09-29)


### ⚠ BREAKING CHANGES

* **call:** a spoken call no longer shares a screen or the camera

### Features

* **artifact:** a document is edited by clicking into it, and no edit is lost in or out of the app ([803afa4](https://github.com/cgoinglove/thursday/commit/803afa4b8b41c79942011ef59b868d99286b23c5))
* **artifact:** a page built on the app kit reads in the app's own type ([f8b2be6](https://github.com/cgoinglove/thursday/commit/f8b2be689cce6bc48ccd2431272b3ebbcbf48181))
* **artifact:** decks keep their four palettes and gain paper and night; boards keep their look beside a plain one ([91657ab](https://github.com/cgoinglove/thursday/commit/91657ab09195252d43b1175fe28a431481b5957d))
* **artifact:** every page a bot makes wears the app's type and its maker's face, and the morning brief is drawn in the app's look ([b64967b](https://github.com/cgoinglove/thursday/commit/b64967bd469ecfe24121ed166de8f5388ffec2d3))
* **artifact:** finished pages read as the app's own, and end naming who made them ([b96ff2a](https://github.com/cgoinglove/thursday/commit/b96ff2aa498b3c864f0804c1161c40549899f671))
* **artifact:** picture books become slides that explain a picture at a time, and a deck prints to a PDF or reads itself aloud ([2abed91](https://github.com/cgoinglove/thursday/commit/2abed9177db30e57190cc8e56153e3f068609c05))
* **bot:** an open thread is its office where her face stands ([0ab9fe9](https://github.com/cgoinglove/thursday/commit/0ab9fe9fd486e9d0d92b523503f65409dfb6f367))
* **bot:** the office reads at a glance, and the room stops jumping ([950d19d](https://github.com/cgoinglove/thursday/commit/950d19d470fe0102e40977f368c7a93ccef6574a))
* **bot:** the office says only what matters: a plate for the bot at work, the one that needs you and the report, and the finish written large ([0d56f6b](https://github.com/cgoinglove/thursday/commit/0d56f6b872857ab8ae8c097fa52e66bfc4a5c3d1))
* **bot:** the office stamps how the job stands, opens a plate where it is, and its bots leap ([993a210](https://github.com/cgoinglove/thursday/commit/993a210908b3dc3f223ecc3a5105c788f2038d00))
* **bot:** the office's ground keeps its stamp alone, papers fall and lie, quiet plates fold to a mark, and a stopped bot's eyes cross ([ec7f828](https://github.com/cgoinglove/thursday/commit/ec7f82878ecc2a1a5a0d5da6272bd60b4d89b1e5))
* **bot:** the report stands open over the thread's bot, a pressed bot opens its last answer there, and the office opens at 70% ([344ddfa](https://github.com/cgoinglove/thursday/commit/344ddfadeb27030e15ce81757083fdf0ace9a39e))
* **bot:** the report stays put, a thread reads without its office, and a bot walks a taken-back report home ([c960e1e](https://github.com/cgoinglove/thursday/commit/c960e1ed295553da0aa4a29c182d83713b439ab4))
* **bot:** the Writer takes mail and whatever goes out in the user's name, the Designer short films, and a job's own form wins over a role's ([8b52a59](https://github.com/cgoinglove/thursday/commit/8b52a595b749c7c4ba8d50478ab1b3331cc4cb01))
* **brief:** a morning brief that is the reader's own — what changed since the last one, why each story is theirs ([6865b06](https://github.com/cgoinglove/thursday/commit/6865b06f48a26dfa60c465612329f00363b1bb15))
* **call:** a spoken call no longer shares a screen or the camera ([bc5e187](https://github.com/cgoinglove/thursday/commit/bc5e187df25e48a4680057b607ff8a426119f41d))
* **call:** draw something and hand it to her as a picture ([ce58e59](https://github.com/cgoinglove/thursday/commit/ce58e591330f6ecc172717b5558dc70e5741c414))
* **draw:** the pad takes back a stroke and brings it back ([d26c28c](https://github.com/cgoinglove/thursday/commit/d26c28c5781e1ace8992e03dbde07ae695e75034))
* **intro:** one press turns the microphone on and goes on ([4e547d6](https://github.com/cgoinglove/thursday/commit/4e547d6d701fb01fae034b98fa876ff10808d986))
* **intro:** the bots step shows who works for you as their office ([c52f226](https://github.com/cgoinglove/thursday/commit/c52f226ef00e1322d954c071784474f073bc7a17))
* **intro:** the microphone turned on in the first run turns the wake phrase on ([95cb72e](https://github.com/cgoinglove/thursday/commit/95cb72ee2b62e8b7cfb6e1252f8f6c5b55ef5eb0))
* **reach:** a page made to be read reaches the phone with a PDF of the whole of it ([5fee772](https://github.com/cgoinglove/thursday/commit/5fee772aa449827da1a025e78f6bdde4d727791c))
* **room:** what you wrote to a bot is yours in its conversation ([20b0a8d](https://github.com/cgoinglove/thursday/commit/20b0a8ddefa0615b7f766d81cb2d6f9c5adc2e0d))
* **theme:** the app draws light until a theme is picked ([f2f347a](https://github.com/cgoinglove/thursday/commit/f2f347af5fbb263c30e644ca9ed30a8246ad0b4a))
* **travel:** a trip page a traveller wants to open — pictures of every place, the money in view, what to do and watch for ([fdb2465](https://github.com/cgoinglove/thursday/commit/fdb2465c0cfbc73ab4664eff7b8375547b53b2ee))
* **travel:** a trip page opens each day on a picture and says what to know at each stop ([a403179](https://github.com/cgoinglove/thursday/commit/a40317951cdb17c42a1497474ab50af854e41754))
* **write:** `@` opens the write line on who to write to ([1c61272](https://github.com/cgoinglove/thursday/commit/1c61272d0095c84f390952a112f4daf0c1a98c13))


### Fixes

* **artifact:** a deck's voices are copied, not moved, its PDF comes from the camera, words in a maker's colour read at 4.5:1, and the page head is one part ([8634d53](https://github.com/cgoinglove/thursday/commit/8634d532ebb237ca8c82374c7b6fdf3c6d7d45da))
* **artifact:** a document gains the print mark when put again, a deck's PDF is checked slide by slide, pages print on A4, and a trip section in the wrong shape stops the build ([6562bc7](https://github.com/cgoinglove/thursday/commit/6562bc78636739426d368e4e1913aa5dd992dfd4))
* **artifact:** a picture copied beside a deck never writes over one a slide still shows ([73ff88a](https://github.com/cgoinglove/thursday/commit/73ff88ad0e96a1349cb3f2188501913c9c061e84))
* **bot:** a bot installed as the Marketer is told its role as the app's words ([f140834](https://github.com/cgoinglove/thursday/commit/f140834a49c17950634c5995e42ec735240a7fd8))
* **bot:** pressing a bot in the office opens its plate, and a bot at rest is drawn in full ink ([a5a6adb](https://github.com/cgoinglove/thursday/commit/a5a6adb45c4873f23a91816073d3e98226a28d6b))
* **bot:** the office's ground plot holds its widest stamp, and the head's opened files fold with nothing left to fold ([b0ac715](https://github.com/cgoinglove/thursday/commit/b0ac715e9275543696d868d8dbaff5cc15a96b2d))
* **bot:** the Tutor's roster line no longer says slides, which the Designer's says ([e1333e8](https://github.com/cgoinglove/thursday/commit/e1333e85c8a787af5bf1fe3150a74972937042c4))
* **brief,travel:** the brief's timeline keeps its line joined, and both pages open calmer ([cd1473b](https://github.com/cgoinglove/thursday/commit/cd1473b6f747774fc1ca898a082cbee7852b9fea))
* **call:** a drawing shown on a spoken call goes to her and she answers it; the plan reads what was put down before the words that followed it ([72e164c](https://github.com/cgoinglove/thursday/commit/72e164c023ec159f57e97c071d2298aee4eac645))
* **call:** a drawing stays on the pad until the line takes it, and what stopped it is said ([b3e07a8](https://github.com/cgoinglove/thursday/commit/b3e07a81f2a1160ea157432be6f600196f4848af))
* **call:** a picture sent to her reaches her as a picture, on every way in ([aa1ccf9](https://github.com/cgoinglove/thursday/commit/aa1ccf9ad2ecc3d7a20b8a8fe34832997487dedb))
* **call:** a run on a shown drawing waits for a turn asked and not yet started, and runs once ([956f654](https://github.com/cgoinglove/thursday/commit/956f65478963556d568e7d241c5a36465ad06776))
* **call:** a turn cut off after two in a row were is continued once again, not left unanswered ([655969d](https://github.com/cgoinglove/thursday/commit/655969d5266025d881d8b73222077a113471b06d))
* **call:** on the GPT Subscription, a hand-over that runs out of steps says so instead of going silent ([f98e64f](https://github.com/cgoinglove/thursday/commit/f98e64fff48f7853fcf96beac88720e9aabc1545))
* **call:** pictures in writing and from a phone are carried by name, read in per request up to a budget, each named ([550a29f](https://github.com/cgoinglove/thursday/commit/550a29f0dd5e1529422b123ab7b1fafff8dadee8))
* **call:** what is put down is in before she is told of it, a turn that ends early waits for its tools, and a call the sdk answered is not run again ([80a7eff](https://github.com/cgoinglove/thursday/commit/80a7effd1fc36ee800fbf2e892197a9577d04391))
* **call:** what is put down on a spoken call waits for the backend's tool outputs, and a clear picture is laid on white ([d7f87f8](https://github.com/cgoinglove/thursday/commit/d7f87f89a3df499af206e0480c2ffa3eec82ea59))
* **config:** API keys says a call needs the plan or a key, not the key ([c64541c](https://github.com/cgoinglove/thursday/commit/c64541c8f6fff2dbcafdd1d29b52cb06747d7b01))
* **intro:** the bots step's office is a job under way that ends while you look, her line beside it ([4c0a84c](https://github.com/cgoinglove/thursday/commit/4c0a84c8e610b6a1f4ed4957d08cfd1bd6014284))
* **intro:** the bots step's office is over in under 7s, its clock starts with the step, and the one who holds it is at work ([86acb39](https://github.com/cgoinglove/thursday/commit/86acb39a459263598aa04f874e446b9a59ebcadd))
* **intro:** the first run reads clean on a laptop, and says one voice is enough ([eb2dacc](https://github.com/cgoinglove/thursday/commit/eb2dacc4fd7e642f28efafbe354b797386dd970a))
* **keys:** a refused key says so in a sentence and opens Settings ([cee6418](https://github.com/cgoinglove/thursday/commit/cee6418afe4a6edae8f5a8c8cdd6ea8aaefa29ab))
* **pill:** the user's own words go out under "You" on the pill too ([e6ecff6](https://github.com/cgoinglove/thursday/commit/e6ecff69f197d8dd09b20defe50fecd8f2c3fb49))
* **text:** a mark that is not emphasis stays in a preview and a caption ([96a0f85](https://github.com/cgoinglove/thursday/commit/96a0f85ab562356dac05486d89bb4c73a92bc43f))
* **write:** `@` on a line that already names someone puts the caret after the name ([4cc301c](https://github.com/cgoinglove/thursday/commit/4cc301cf8faf921fb3497073eda7feac1d8e0eb4))
* **write:** at phone width the words get a row of their own ([b7340be](https://github.com/cgoinglove/thursday/commit/b7340be556332d2ea8cfe7402f0d67f9c0549423))


### Performance

* the first call no longer waits on the device's position, and what nobody sees is not drawn ([#60](https://github.com/cgoinglove/thursday/issues/60)) ([80fbc0a](https://github.com/cgoinglove/thursday/commit/80fbc0a308782f06d5518e01ee445f7b52c65cca))
* **ui:** ShinyText's sweep moves by transform, so it runs on while the page is busy ([e6d525b](https://github.com/cgoinglove/thursday/commit/e6d525b4fff20de4aa1bf04dceaeda9841561f64))


### Under the hood

* **artifact:** a deck's size and the reading of its data live in one module ([07b5088](https://github.com/cgoinglove/thursday/commit/07b5088d2106d0912d09a024591d755dffb9c2e8))
* **artifact:** the grey ground and its cards are the shell's, and paper stays light ([b8fa85a](https://github.com/cgoinglove/thursday/commit/b8fa85a37db5bdcbb6003a925f4c9d1bd1900dc7))

## [0.22.0](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.21.0...thursday-agent-v0.22.0) (2026-09-29)


### Features

* **artifact:** motion videos — short hand-drawn films with music ([#57](https://github.com/cgoinglove/thursday/issues/57)) ([8b90294](https://github.com/cgoinglove/thursday/commit/8b902946f5ea6c4a32cde0107aa52d3be87d07f7))
* **bot:** a bot keeps a skill of its own for a kind of job that comes back ([18de1af](https://github.com/cgoinglove/thursday/commit/18de1afa6a93e674a1477fa13ccec3a10ed7af3c))
* **bot:** a thread holds eight bots, and all eight can work at once ([62e9d3f](https://github.com/cgoinglove/thursday/commit/62e9d3f1a395aaa2e9c91c46d02426c90981ec63))
* **bot:** watch a thread as an office, live or replayed ([937f7b8](https://github.com/cgoinglove/thursday/commit/937f7b8b472042915b9a5d66d223d434763047f5))
* **call:** her face shows where you are, the pictures you give her, and her own drawings ([#56](https://github.com/cgoinglove/thursday/issues/56)) ([7c41387](https://github.com/cgoinglove/thursday/commit/7c41387d2dd7bdec3670101f13f599183c4dff26))
* **signins:** a site keeps a sign-in per account, and a bot names the one it uses ([38f0e52](https://github.com/cgoinglove/thursday/commit/38f0e5260ff96b84afd0046dca8cef942db4de55))


### Fixes

* **bot:** the office follows a thread at work, drawn from where it stands now ([bc294ab](https://github.com/cgoinglove/thursday/commit/bc294ab6f6d47a2a7316a370f49a38e2957e02b9))
* **call:** a failed call or turn shows the provider's words, not a sign-in or key button ([efe69c8](https://github.com/cgoinglove/thursday/commit/efe69c839739cc0741bc922a6cb116759deb683d))
* **call:** CALL stays on her face while she rings ([fc0a67f](https://github.com/cgoinglove/thursday/commit/fc0a67fe1759c4b7db3e1efcd83e2ad86dd66b08))
* **call:** her face keeps only the globe, and the globe runs in three quarters of the time ([#58](https://github.com/cgoinglove/thursday/issues/58)) ([2ca157f](https://github.com/cgoinglove/thursday/commit/2ca157fc406a8051b0184eb0bd4f27172b02313b))
* **call:** she looks at what is shown only when her backend asks, on every line ([67f3df2](https://github.com/cgoinglove/thursday/commit/67f3df23f148302777d9e1fb15065055396128dd))
* **intro:** a Free sign-in does not flash as set while its plan is read ([cfb8bee](https://github.com/cgoinglove/thursday/commit/cfb8bee440ce1e1db2049f3b642995d680b77ec0))
* **intro:** a key given before still leaves the plan to sign in to, and her face no longer covers the words under it ([d8e27c4](https://github.com/cgoinglove/thursday/commit/d8e27c4fdd028107f48e0bc371e2286a428b98ae))
* **intro:** the two ways to her voice wear one round button ([070e33e](https://github.com/cgoinglove/thursday/commit/070e33e48a6ab1f599375525c82b592b93f9594a))
* **settings:** the Vercel AI Gateway row drops its "recommended" tag ([902554e](https://github.com/cgoinglove/thursday/commit/902554e281bc73290612b125254e82c8240a22ed))
* **signins:** a kept sign-in is renewed only from the browser it was lent to ([5427497](https://github.com/cgoinglove/thursday/commit/54274974b83e8184fa3d8bb8e63ac72f3d44ced1))
* **signins:** a sign-in lent again is the renewed one, and a signed-out account stays out ([c1093a8](https://github.com/cgoinglove/thursday/commit/c1093a8d0c779d0e624d142e468f785ee16b010e))
* **ui:** small print wraps between hints, a bot on the app default says where it compacts, examples read as examples ([b375c4b](https://github.com/cgoinglove/thursday/commit/b375c4b71e0883fbe3c1a721b05aa954f706c73f))
* **ui:** Tab moves on from the @ list when nobody matches ([04c2bac](https://github.com/cgoinglove/thursday/commit/04c2bac5a27d3ab9e812fc92ea5c526c63705d12))
* **ui:** Tab takes a bot from the @ list; a new bot may run on the app default model ([a54f708](https://github.com/cgoinglove/thursday/commit/a54f7088ee7d9c2862b5188997f9f67b365ee279))


### Under the hood

* **intro:** simplify Mic component rendering in the Intro component ([ea97d2a](https://github.com/cgoinglove/thursday/commit/ea97d2ab2a48c9757405281cb4818cd1fbffd4b8))

## [0.21.0](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.20.0...thursday-agent-v0.21.0) (2026-09-28)


### Features

* **call:** show her your camera, and on the GPT Subscription she sees what you show as work is handed over ([#53](https://github.com/cgoinglove/thursday/issues/53)) ([995c263](https://github.com/cgoinglove/thursday/commit/995c263a90f0653e56c0a20ce6711ef72e0d1f18))
* one ChatGPT sign-in runs calls, bots and pictures ([#50](https://github.com/cgoinglove/thursday/issues/50)) ([d382603](https://github.com/cgoinglove/thursday/commit/d382603e9f9265a1f1dae1430a366ba924717972))


### Fixes

* **settings:** a key the environment sets says so, and Remove or Replace no longer reports done what changed nothing ([#52](https://github.com/cgoinglove/thursday/issues/52)) ([36ab26a](https://github.com/cgoinglove/thursday/commit/36ab26a12e5d70d9c156c028f429f3bd79bd28fa))

## [0.20.0](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.19.0...thursday-agent-v0.20.0) (2026-09-27)


### Features

* **bot:** one bot hands a job out, and work that needs another's answer waits for it ([d196644](https://github.com/cgoinglove/thursday/commit/d19664485f3b4ed890d365ed7fc2e85adfe8aeae))
* **call:** a call in writing moves onto the OpenAI key when the GPT plan is spent ([eff378a](https://github.com/cgoinglove/thursday/commit/eff378a1c3b2e57a02c7979b7295f9fa75524b38))
* **call:** both call prompts know the user's town and its weather, when the browser shares where they are ([25d0a6a](https://github.com/cgoinglove/thursday/commit/25d0a6a7604cd067b8ae03f6fe11f0cb6b8fcc79))


### Fixes

* **bot:** work held `after` another bot goes out once the coordinator has read that bot's answer ([e2c1839](https://github.com/cgoinglove/thursday/commit/e2c1839513cc4555c0746e79da97303d3c75ed82))
* **call:** where the user is never fails a call: a malformed one is dropped, and a refusal is read without a global ([e387341](https://github.com/cgoinglove/thursday/commit/e387341f330513f8d05dc4c2e67d38f021ef2df8))
* **cli:** an older Node is told what to type to update it and start again, on Node 10 and up ([c8cf2e5](https://github.com/cgoinglove/thursday/commit/c8cf2e54b3426d7080a0dae494615626e7a9da8e))
* **test:** the whereabouts test keeps one module, so it passes on Node 22 ([188f318](https://github.com/cgoinglove/thursday/commit/188f31896f006f2007ee1fb128798dd825c4619b))
* **ui:** update loading text in Combobox and remove ellipsis from connection status in Reach Guide ([d141dad](https://github.com/cgoinglove/thursday/commit/d141dad639a3a55683c8586c2c1f8d24e4690796))

## [0.19.0](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.18.0...thursday-agent-v0.19.0) (2026-09-26)


### Features

* **bots:** each seed bot wears a fixed face instead of one rolled per install ([7eb52c2](https://github.com/cgoinglove/thursday/commit/7eb52c27a3c6101d751cd01b481ac30782c71eef))
* **call:** share a screen with her, and she looks when asked ([2b36634](https://github.com/cgoinglove/thursday/commit/2b3663471608729c80e2d8bf75143e4b1f10aa16))
* **cli:** keep it running in the background on a Mac, with no global install ([fc5f947](https://github.com/cgoinglove/thursday/commit/fc5f9471cc02c4534eb413087abe464f0fb782a7))
* **models:** OpenRouter as a second catalog provider, browsed like the gateway ([b6a800a](https://github.com/cgoinglove/thursday/commit/b6a800a45f41361f25c1394ea4caab3f9af350e4))
* **settings:** Settings › Thursday says where the app runs, with the command to change it ([2319543](https://github.com/cgoinglove/thursday/commit/23195439ff84cc495d0f021be2778108ab8c1def))


### Fixes

* **call:** a look waits for a share's first frame ([7be32d9](https://github.com/cgoinglove/thursday/commit/7be32d9073e908de6dcb6c9ddf696b57be45508d))
* **call:** a share that outlives its call is stopped, and a refused one says why ([985c7c3](https://github.com/cgoinglove/thursday/commit/985c7c3b0f8b1ba6320fb21d2046a63e50c87060))
* **cli:** one server per folder in every time zone, and a background start that fails cleanly ([c355fb5](https://github.com/cgoinglove/thursday/commit/c355fb57747282906fc1dc832b3fc4c7b1704a3d))
* **cli:** the background finds a Node when its own is gone, keeps its log short, and a failed start runs in the terminal ([d02471e](https://github.com/cgoinglove/thursday/commit/d02471e217eece20ca3a8abba0c53b8acf0cb669))
* **intro:** the opening's sounds fade out instead of throwing ([f26d31f](https://github.com/cgoinglove/thursday/commit/f26d31ff47ed69c0bfe5811ab0d8095838b8d8ac))
* **skills:** a photo is credited to the page it came from, and a stop takes its article's lead picture ([2ede80c](https://github.com/cgoinglove/thursday/commit/2ede80ccbc3a9c43cb019f3ce2972dde9c7de947))


### Docs

* **maps:** a map says what breaks, and a rule is only what the maintainer approved ([84259f0](https://github.com/cgoinglove/thursday/commit/84259f04a103b7b0fbf641525bf00d1f2d3181c9))

## [0.18.0](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.17.2...thursday-agent-v0.18.0) (2026-09-26)


### Features

* **bots:** a note about a file finds the thread that reported it, and says first why it cannot be sent ([fe0322a](https://github.com/cgoinglove/thursday/commit/fe0322a035b0b92893277a6a92848d5f29cf5712))
* **files:** a note under a finished file goes to the thread that made it, and the file shows a bot's rewrite while open ([8c02ada](https://github.com/cgoinglove/thursday/commit/8c02ada3b0244fb64efe76ce0721ee782f951dc1))


### Fixes

* **bots:** a bot's later runs in a thread read the conversation back from the provider's cache ([fd5241a](https://github.com/cgoinglove/thursday/commit/fd5241a75a9f8ddf9b54e208351b143b21df72ea))
* **call:** she opens the call before the room is heard ([9a556f8](https://github.com/cgoinglove/thursday/commit/9a556f88efadc50de7dd38c8f4e860639807d48d))
* **call:** the first call opens the way every other call does ([c15b0b9](https://github.com/cgoinglove/thursday/commit/c15b0b90b59d0814b839386749ab9ea670688e08))
* **chatgpt:** a run on the plan reads its conversation back from the cache, by the header the backend keeps it by ([071b9fc](https://github.com/cgoinglove/thursday/commit/071b9fc9ff4bb3af79644625a29941c62d937be9))
* **cli:** a lock left by a server that died is not taken for a running one ([8edfcea](https://github.com/cgoinglove/thursday/commit/8edfcea651c1198a7496792548c8d3a9b9cd71cd))
* **cli:** a second start opens the one running, and every hint names a command this install has ([f33a9cb](https://github.com/cgoinglove/thursday/commit/f33a9cb116378f37ba6d28de159feeafc69f7ba3))
* **files:** a file no report names says only that, since that is all the app knows ([4e6843d](https://github.com/cgoinglove/thursday/commit/4e6843daeb8cdbc1f32916e1f803f88cc70901c7))
* **files:** a picture a skill drew beside a reported page finds the page's thread ([1075476](https://github.com/cgoinglove/thursday/commit/1075476b5318c067f8f65cc294ca9e73b6c1701d))
* **files:** the note under a file checks the bot's model without logging a fallback ([b7d713d](https://github.com/cgoinglove/thursday/commit/b7d713d540659ba50a2c1823266bea70796093e6))
* **files:** the note under a file whose thread was deleted says so, not that no thread made it ([4b796b4](https://github.com/cgoinglove/thursday/commit/4b796b4f389d913ead4ff939eaed4b1f361a33ae))
* **intro:** in a narrow window each step stacks under her instead of running off the edge ([fcd722d](https://github.com/cgoinglove/thursday/commit/fcd722de7be3be076a761f77f7389989b4ef876d))
* **intro:** once left, the first run stays gone, and only that first leave sets the bots up ([f1b4f4b](https://github.com/cgoinglove/thursday/commit/f1b4f4b91fa4cc141a1f896fc74f2be615fa00a1))
* **intro:** the first screen keeps its captions in a narrow window ([42ecc4b](https://github.com/cgoinglove/thursday/commit/42ecc4bf48a55ff38524d30c454613f61fdb6570))
* **intro:** the microphone step's main button turns it on, and says so while the browser asks ([d9db582](https://github.com/cgoinglove/thursday/commit/d9db5825af7217e1b0ef1553427e64110e5e334f))
* **models:** a refusal says the provider's reason when its response carried no status word ([5153405](https://github.com/cgoinglove/thursday/commit/5153405d77868b36d59feb18d4ecd55a1f090225))
* **prompts:** she knows her bots work on this computer, and says so when asked ([2cc642e](https://github.com/cgoinglove/thursday/commit/2cc642e35e2045402fcddbeae3ed085c92de967a))
* **settings:** Cmd+1..9 asks about a routine typed and not kept, as a click does ([1ac0f36](https://github.com/cgoinglove/thursday/commit/1ac0f36e7db9377957332d1a0f0638ecb2456500))


### Docs

* **guide:** shorter by 40%, and what it says checked against the code ([65f3294](https://github.com/cgoinglove/thursday/commit/65f3294b266d7d898bbd5549dab0f1a9211ba228))
* **readme:** the section pictures are drawn, not cut from the film ([7c5e133](https://github.com/cgoinglove/thursday/commit/7c5e1333385d3939e39e3c8844978d4db400bd49))
* **readme:** the section pictures get a light of their own ([15b72f6](https://github.com/cgoinglove/thursday/commit/15b72f64589cb259f18bc364f531ddafd3f22e99))
* **readme:** the section pictures stand on a plain ground ([7b95bb7](https://github.com/cgoinglove/thursday/commit/7b95bb784ff6e7cce0332ad29eb4cfe79006b7d8))

## [0.17.2](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.17.1...thursday-agent-v0.17.2) (2026-09-26)


### Fixes

* **bots:** a question is written to the user, research stays out of sight, and a page is not left half in English ([5419f96](https://github.com/cgoinglove/thursday/commit/5419f964bd641b9fba1784fc768721799659f5a4))
* **bots:** a ready-made bot's role is said as the app's, and words nobody changed follow the seed ([239e55a](https://github.com/cgoinglove/thursday/commit/239e55a51dfa403a319acdcd984cd525eabc96e8))
* **bots:** the pinned-tools field says nothing until its list has come ([219a922](https://github.com/cgoinglove/thursday/commit/219a922222afc04ec8b1825a474a32a4735a1fe3))
* **call:** a goodbye ends the call, she is a friend rather than an interviewer, and four characters instead of ten ([397c910](https://github.com/cgoinglove/thursday/commit/397c910cafb661856c35b389d45e704e01c4bf2f))
* **call:** a quiet call hangs up after 25 seconds, not 40 ([be8b109](https://github.com/cgoinglove/thursday/commit/be8b10998247375a2c31aaecf3d9082b45947ccd))
* **call:** in writing, news from a bot is said with whose work it is first ([bef6f18](https://github.com/cgoinglove/thursday/commit/bef6f1824a8de7d06d2f8de7c17b75e6e03da1ae))
* **call:** one spoken call across the app's tabs, and a tab that closes ends its own ([ed172f4](https://github.com/cgoinglove/thursday/commit/ed172f46ad5137cae0e00aeb0e1f3484ec8c0c6d))
* **call:** what the work sends her voice is said whole and in words, and "working" ends with the handoff ([f631e04](https://github.com/cgoinglove/thursday/commit/f631e04ce38e56fdb58e92179c6cf881c89c9c4c))
* **copy:** what the screen and the guide say is what happens ([0da65a1](https://github.com/cgoinglove/thursday/commit/0da65a18dd7c31f08d91df85be3225ab7da8c482))
* **data:** data a newer version wrote is not offered to be set aside ([482f3d5](https://github.com/cgoinglove/thursday/commit/482f3d583a6159cfdfb8b7c66b71365f184e78d4))
* **first-run:** the picked bots come along without a key, she says what works, and / always opens on her ([c703cbf](https://github.com/cgoinglove/thursday/commit/c703cbf52323777c8e104e4a00297984185b9bfd))
* **models:** a bot on the plan can search, the plan comes before a key, and Settings names what Automatic runs ([2a4aa97](https://github.com/cgoinglove/thursday/commit/2a4aa970a2371ba6eb73870b27b91daaedbf47c7))
* **models:** a bot with no model picked runs on GPT's small model, as a call's backend does ([25fadcb](https://github.com/cgoinglove/thursday/commit/25fadcbd8d962ca5b1e65aa86fcc976a724cc66c))
* **models:** with nobody picking, a paid plan runs its middle model ([336c8f8](https://github.com/cgoinglove/thursday/commit/336c8f826baaab08aef5e10c49e0586296b3dd3f))
* **phone:** the app's work line only for a wordless turn, a page as its pictures alone, and no row of commas ([cde8879](https://github.com/cgoinglove/thursday/commit/cde88792bee56cd9897bff85324d82bccac7aa32))
* **screen:** ↓ comes back to now on every call, and nothing is reached through the intro ([b7eee3b](https://github.com/cgoinglove/thursday/commit/b7eee3bb9ccf810cfae9306d835defda759da780))
* **security:** the app is framed only by itself, two reads that act refuse other sites, and more secrets stay out of a bot's shell ([b40cb86](https://github.com/cgoinglove/thursday/commit/b40cb86acaca026df44af2262a9cd94cddd45302))
* **settings:** a routine's name or job typed and not kept is asked about before it goes ([7c7e1cc](https://github.com/cgoinglove/thursday/commit/7c7e1ccf0582f252b251c8d72cb26bb4b0ceb0bb))
* **ship:** one server to a data folder, an old Node told what it needs, and nothing published untested ([c7eeb71](https://github.com/cgoinglove/thursday/commit/c7eeb71987ff6e7d70247e6bdf951f3224238559))
* what the user set stays set, and nothing is thrown away or billed twice unasked ([bf3407a](https://github.com/cgoinglove/thursday/commit/bf3407a5ace6f10719915cdf3fe63442386dcdf2))
* **workbench:** a bot's command runs in bash where the machine has it, as the tool says ([7ab9fad](https://github.com/cgoinglove/thursday/commit/7ab9fadbcdeb11c446d801e93184990530713e50))

## [0.17.1](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.17.0...thursday-agent-v0.17.1) (2026-09-25)


### Fixes

* **bots:** a bot that hands work out waits for the answer instead of doing it twice ([f5ec2c4](https://github.com/cgoinglove/thursday/commit/f5ec2c41334d109a35bda41281d765aeb3a6f32e))
* **skills:** a CSV is read as it is written, and says what it could not take ([0f57878](https://github.com/cgoinglove/thursday/commit/0f578784457dd905a41fa9808f451ea7d4dadd09))
* **skills:** a picture book is reached by its path as well as its name ([bd03ea7](https://github.com/cgoinglove/thursday/commit/bd03ea799e82336f2cbd9ac86958469c911b6272))
* **skills:** the bank-export test writes its own bytes beside a second bank, and the Analyst may end in a sheet ([405897f](https://github.com/cgoinglove/thursday/commit/405897f3a8c81e977995a25b63b2ab12ae5f9da4))

## [0.17.0](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.16.0...thursday-agent-v0.17.0) (2026-09-25)


### Features

* **call:** she is drawn in Apple's emoji on Apple devices and in letters everywhere else ([7e40389](https://github.com/cgoinglove/thursday/commit/7e4038929d50800e2da258a8453ec379437caf07))
* **intro:** add sound management for intro sequence and mute functionality ([94d3956](https://github.com/cgoinglove/thursday/commit/94d3956ff2e3c222c5077be0463ab21bfb278897))
* **skills:** a deck has dates along a line, two sides compared and figures side by side, numbers its slides and names its maker on the cover ([7b8cef0](https://github.com/cgoinglove/thursday/commit/7b8cef0d1a84d9d0c84a0becc54521fa9b122aa2))
* **skills:** a document saves as a Word file ([1d33d13](https://github.com/cgoinglove/thursday/commit/1d33d137279f7323415e7c07ab7261fa56d0df4c))
* **skills:** a page carries the face of the bot that made it, and a document sorts its columns and shows a footnote where it is cited ([a1f6e9d](https://github.com/cgoinglove/thursday/commit/a1f6e9def3cef00f9a982dd2a2956f070adbefb2))
* **skills:** a picture book names the bot that drew it on its cover and can end on a quiz ([c2ad5d4](https://github.com/cgoinglove/thursday/commit/c2ad5d4392ae36d8e054c091b47e164cf45cca51))
* **skills:** a sheet — a real .xlsx with its formulas, and a page that shows it in the app ([6b04b59](https://github.com/cgoinglove/thursday/commit/6b04b592f3f540c46ab4f1d8052b125c6e401037))
* **skills:** a sheet edits in the app and writes its .xlsx, no Excel needed ([1cc4f83](https://github.com/cgoinglove/thursday/commit/1cc4f8345747d3a3f8fd8c757d154cdb4c2a7ecf))
* **skills:** a sheet holds real dates, and negatives and zero read their own way ([02e4f1c](https://github.com/cgoinglove/thursday/commit/02e4f1cd398baf0bc6b0a97206fff69c7880e05c))
* **skills:** a sheet shows what a formula uses ([8984f79](https://github.com/cgoinglove/thursday/commit/8984f79df8c8d703414be98e9842b0ce07ebf605))
* **skills:** charts draw upright columns, a donut and stacked bars ([63e095a](https://github.com/cgoinglove/thursday/commit/63e095ae1a2a7768cf45679b0046c11996a6dc29))
* **skills:** receipts and a bank's export become a sheet ([afa78c3](https://github.com/cgoinglove/thursday/commit/afa78c3e71160b41fd6f827a0cb06a1511c1d6d9))


### Fixes

* **skills:** a canvas's leading board shows the word it is marked with ([11b5ff2](https://github.com/cgoinglove/thursday/commit/11b5ff2eae2531cda8e259375cbd9306ce1a6a17))
* **skills:** a picture book's pages go in through put, and an empty book is not shot ([dfc99a3](https://github.com/cgoinglove/thursday/commit/dfc99a367528ac002becf6f2a4a9a0d42dad55ac))


### Performance

* **intro:** the call screen does not draw her face under the intro ([4fd2d20](https://github.com/cgoinglove/thursday/commit/4fd2d20a16e4467abe99fef8083caaf9b795f32f))


### Under the hood

* **call:** her face is drawn in emoji alone; the letter and mixed glyph sets are gone ([4ec0a8c](https://github.com/cgoinglove/thursday/commit/4ec0a8c26ff5b9709bdca74527eac932b650fd84))


### Docs

* **readme:** the hero and the top link open the launch film, the real-call demo beside it ([095c1b0](https://github.com/cgoinglove/thursday/commit/095c1b0e985d6097ecee5a14c1716cf69ac1737a))
* **readme:** the section pictures are scenes from the launch film ([ab6a9b9](https://github.com/cgoinglove/thursday/commit/ab6a9b908566c6bc60f6d1a318a83778881f680c))

## [0.16.0](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.15.0...thursday-agent-v0.16.0) (2026-09-25)


### Features

* **call:** a call she places sounds once, and the call sounds are Android's NFC sounds ([1088560](https://github.com/cgoinglove/thursday/commit/1088560fbd3117d36ac35af041299c5b08e0d7ac))
* **call:** the mic's bars stay on the line while she works, and the answer-is-coming chip and its setting are gone ([efd93ce](https://github.com/cgoinglove/thursday/commit/efd93ceeb6c5af089efa77f739944f6f26bc80e9))
* **connectors:** a server is connected by signing in or a pasted header, never a hand-registered OAuth app ([42fda81](https://github.com/cgoinglove/thursday/commit/42fda81ee24be9c66d1a0396d988d9e27efddaab))
* **settings:** the settings list ends with a community group, Ask on Discord and GitHub ([b733722](https://github.com/cgoinglove/thursday/commit/b733722f9029f6e69b458c1fbd4851471225dd39))
* **skills:** a chart can be drawn as a picture, so a deck, a board or a post can carry one ([2c13a51](https://github.com/cgoinglove/thursday/commit/2c13a516fb87494da488faf9527acbabdb9ae938))
* **skills:** Settings › Skills shows each bot's own skills, and its editor never saves one file's words into another ([8fdad2a](https://github.com/cgoinglove/thursday/commit/8fdad2a5b3ba7b00ff438df86e32b504d8207ab7))
* **thursday:** her face is drawn one way for everyone; the Face settings are gone ([31eab02](https://github.com/cgoinglove/thursday/commit/31eab02a33c09cdfd8e1b8410b5c9e5b50ef42d8))


### Fixes

* **artifact:** a deleted bot's finished work stays a shelf under its name, and its folder is never one artifact to delete ([1a91942](https://github.com/cgoinglove/thursday/commit/1a9194279faebc8758e1f659dcffcfaee7922c96))
* **bot:** a bot's mark makes no gestures of its own when the system asks for reduced motion ([fbd35ec](https://github.com/cgoinglove/thursday/commit/fbd35ec806a9cac8153a09911efeacdbea5c8af2))
* **bot:** a done thread's answer is read off its last step, so one in several blocks keeps its mark and copy ([7c043e3](https://github.com/cgoinglove/thursday/commit/7c043e3c2d89744fd0fa1a7557e9ae1452b31b28))
* **bot:** a search step's source links keep their whole address; only a long title is clipped ([e9954d0](https://github.com/cgoinglove/thursday/commit/e9954d0e58b1c1726a096589b4c5f581102fa013))
* **bot:** a stand-in face beside real bots no longer says "No bots yet" ([51ad50d](https://github.com/cgoinglove/thursday/commit/51ad50d31e1f9ac979c01525ffd015cea090f969))
* **bot:** a stopped thread's header says "stopped", not the status value "cancelled" ([cff9fa7](https://github.com/cgoinglove/thursday/commit/cff9fa7418b07293a9c16523b8fc403a23b1b6e5))
* **bot:** an open question is matched to its thread line by id, so the same words asked twice keep the answered one ([11ba72b](https://github.com/cgoinglove/thursday/commit/11ba72b67ecc6e1b0b9d529931ccbd76ce7fc774))
* **bots:** a bot page's row labels name their fields ([d58c8c0](https://github.com/cgoinglove/thursday/commit/d58c8c0d2d986f32a65d80c362b3122b75384fc2))
* **bots:** bot and thread actions check their words are text before using them ([c1f068d](https://github.com/cgoinglove/thursday/commit/c1f068d3349add5666d1fe4ac8a12cb6387e2e66))
* **call:** a wake phrase is English words, and one in another language is not saved ([539e501](https://github.com/cgoinglove/thursday/commit/539e5012c8e99bf134e62f053ded5daf5322b4d6))
* **call:** the connect and end sounds peak under 0 dBFS ([612bb5f](https://github.com/cgoinglove/thursday/commit/612bb5f8c51d4f8b52df170a567c0570ec65a7e5))
* **call:** the thinking line shows the model's title as written, not re-cased by a regex ([8220555](https://github.com/cgoinglove/thursday/commit/8220555eb6c33db76ed23741f30be3b3a676ca2c))
* **call:** the wake phrase keeps its letters in every script, where it kept a-z and 0-9 alone ([d4df031](https://github.com/cgoinglove/thursday/commit/d4df031e962f47418bf598ba743600cf0c30e0ad))
* **call:** web search with an Exa key hands her the pages' text, not {} ([fceb79e](https://github.com/cgoinglove/thursday/commit/fceb79ed6ecea35f80028b35f1189654101d3fa7))
* **config:** a key, sign-in or pick written from anywhere signals every open tab ([281b6b1](https://github.com/cgoinglove/thursday/commit/281b6b1eda1d07b8d887069fd3b2e55497650a7e))
* **config:** the voice key's "Not OpenAI?" warning knows every provider's key by the catalogue's keyLooks ([8c313ea](https://github.com/cgoinglove/thursday/commit/8c313ea9575e98ec75549762cffbdb4f570dbbf5))
* **connectors:** a server that refuses to register the app is said to, whatever the SDK prints ([4c252e8](https://github.com/cgoinglove/thursday/commit/4c252e8ba0e2717557ae599d6883a049339049a2))
* **connectors:** a server that refuses to register the app keeps its own words after ours ([a2e9919](https://github.com/cgoinglove/thursday/commit/a2e9919ea0a26e68060b91a3a82b4cb64d06f67d))
* **deck:** a contact sheet past what one look takes goes back as words ([b47bc1a](https://github.com/cgoinglove/thursday/commit/b47bc1a2d2c92be10df4fb73a4c8b0e423966e82))
* **intro:** putting the bots' model back to Automatic in the first run clears its effort too ([ceb40fd](https://github.com/cgoinglove/thursday/commit/ceb40fd1c628d77aabbc159a537415599cbe2f56))
* **intro:** the first run's silent demo names no place to leave from and no currency ([7f103dd](https://github.com/cgoinglove/thursday/commit/7f103dd3f4d7958e9354a3452d1e6669d435ff9b))
* **intro:** the microphone step says why the microphone did not open, not always that it is not allowed ([bef06f2](https://github.com/cgoinglove/thursday/commit/bef06f21182921f701928fd64b7ccfd5badf5a0e))
* **models:** a gateway video price that names no resolution reads "$0.042/s", not "$0.042/s undefined" ([10593f3](https://github.com/cgoinglove/thursday/commit/10593f339219aaadfb0c20144b3770e04ec516d9))
* **reset:** pnpm reset refuses while a server has this data folder's database open, and stops nothing ([7bb2a7c](https://github.com/cgoinglove/thursday/commit/7bb2a7c05b88509cc51f75dbb07c81e1591dfb0b))
* **signins:** the map of sign-ins a browser holds is one across a dev reload ([c45871a](https://github.com/cgoinglove/thursday/commit/c45871a2ad366574244928651c9bc48075a9e76a))
* **skills:** a chart drawn into a placeholder that holds its own kind replaces all of it ([d256b93](https://github.com/cgoinglove/thursday/commit/d256b93ca0080bcc51147957d7770a4445663b42))
* **skills:** a chart picture's drawing keeps the size it is given inside its card ([9199bbd](https://github.com/cgoinglove/thursday/commit/9199bbdcc9450d1c2ce631259f86e45a37d6111d))
* **skills:** a document, book, deck or canvas no longer says it is in English whatever it is written in ([206f900](https://github.com/cgoinglove/thursday/commit/206f90037105a0187a58f324ffec220e3853a1a5))
* **skills:** an uploaded archive is weighed before it is unpacked, and a link out of a skill is not followed ([75eca1c](https://github.com/cgoinglove/thursday/commit/75eca1c082880a79ec38b07c2cef1eee361d696c))
* **skills:** the app kit's build says to build with app.mjs, the script that sets PAGE ([2503d0e](https://github.com/cgoinglove/thursday/commit/2503d0e50820bd8a2a802ac341ba362dd648711c))
* **skills:** the audit's remaining skill items — words counted in any script, no unsourced figures, a transcript's times read or refused, recordings written up ([7055f6f](https://github.com/cgoinglove/thursday/commit/7055f6f93d49d085f22e8fdc4d331bfdf2e886ab))
* **ui:** a JSON view's folds take focus and open on Enter or Space ([16fd425](https://github.com/cgoinglove/thursday/commit/16fd4250763cfdb4eb9ff303ddd4a7bbb46e71f5))
* **ui:** a settings dialog is announced by the title it shows ([e33a227](https://github.com/cgoinglove/thursday/commit/e33a227d10c1d4807bf3da7b6120511b6814456d))
* **ui:** folded text, the caption pages, the context bar and a thread's reply box reset in the render that brings the new text or thread ([77aa106](https://github.com/cgoinglove/thursday/commit/77aa106a685fe2034783a6db06a88acea2d736d0))
* **ui:** her face, the intro's echoes and the bot marks draw dark from their first frame on a dark system ([3367f91](https://github.com/cgoinglove/thursday/commit/3367f913afdb1ef14cc5d4eb82d212d76167a1cd))
* **ui:** removing a saved key, a phone token or a memory fact asks first ([dee1fd2](https://github.com/cgoinglove/thursday/commit/dee1fd24a4a48398c4a0861d0d93450b3e0c7290))
* **ui:** the page's meta description reads as plain English ([1272778](https://github.com/cgoinglove/thursday/commit/1272778ed59b19162b5f97a903139a1afaa75cb6))
* **ui:** the shared Combobox says only "Loading…" while its list loads, not what the list holds ([bb529fa](https://github.com/cgoinglove/thursday/commit/bb529fa4344287f96611a35cf45a9f7745cf416c))
* **workbench:** a bot's shell leaves out what the app set to run itself, and a kept sign-in is only kept over or renewed for the bots it is lent to ([25d5cb6](https://github.com/cgoinglove/thursday/commit/25d5cb6d6674c36d1a2b1eb268eb5b2bc2a7dacc))
* **workspace:** a bot's shell names its finished-work folder whole, so a kit script run from any folder delivers there ([142fae6](https://github.com/cgoinglove/thursday/commit/142fae62b0d28892adc0992e5436628b9dbcb76b))
* **workspace:** the browser CLI is pinned to the version its folder names were read from ([ca9988c](https://github.com/cgoinglove/thursday/commit/ca9988c8c4134d2e77e208fd224d5588c8c0d728))


### Performance

* **call:** her face is drawn at most 30 times a second ([af2e8cb](https://github.com/cgoinglove/thursday/commit/af2e8cbd581b8b9d577dae6bfd75843662a359ed))
* **ship:** the published package leaves out the checkout's sources, README images and type packages — 22.6 MB to 17.3 MB ([d64799d](https://github.com/cgoinglove/thursday/commit/d64799d77c0409e8e41cc7c54ef95ba9153ae517))


### Under the hood

* **bots:** the speaker the user's words are stored under is one constant ([b852916](https://github.com/cgoinglove/thursday/commit/b852916d3dcf5b94650a7c8440d254c02405360b))
* **call:** a note is read off a part by one noteOf in thursday.schema, for the page and the server ([3b24640](https://github.com/cgoinglove/thursday/commit/3b24640c53e29974331183e0a1c857c766e511a9))
* **call:** her frame cap is read from ASCII_FACE, not a prop ([d72003a](https://github.com/cgoinglove/thursday/commit/d72003a283669b5fd98e5c6195d7f8e00800c570))
* **call:** the wake word's tolerance is config.ts WAKE_TOLERANCE, and its hook takes no options nobody passes ([ed766ea](https://github.com/cgoinglove/thursday/commit/ed766ea50ae5d724351e409745f9df8f81e29148))
* **connectors:** the connector list learns an OAuth sign-in finished from the mcp signal alone ([1aa35aa](https://github.com/cgoinglove/thursday/commit/1aa35aad32954a2a8defc7e0dec109106fee76e1))
* **memory:** the Memory screen reads a call's arguments as memory.tool types them ([3fa4b81](https://github.com/cgoinglove/thursday/commit/3fa4b81a619e47561b9a899fe5ef3fc411956386))
* **reach:** a question's item key is built by open-work's questionKey wherever it is matched ([990495f](https://github.com/cgoinglove/thursday/commit/990495fb1aad311e6c0a2be75563e2d798fd9153))
* **sandbox:** the readdir wrapper is type-checked, without `as any` ([efcd1ef](https://github.com/cgoinglove/thursday/commit/efcd1ef9e81d44f5cb1a7ad2af1b81e88f49a5a9))
* **ui:** notify's four dialogs make and take down their root through one mount ([5aabba5](https://github.com/cgoinglove/thursday/commit/5aabba5e6f51a365fb9d8cf310cc9119dbc40ca0))
* **ui:** useIsDark reads the resolved theme instead of following the system a second time ([311a74d](https://github.com/cgoinglove/thursday/commit/311a74d38f6d84511f80236a0e10877b8c99ff7e))
* **workspace:** a finished job's files take their lead page from one leadFirst ([be2c8e3](https://github.com/cgoinglove/thursday/commit/be2c8e3a6e04b1036332cb65ba049b009db0bbea))
* **workspace:** the browser list, the state file and the CLI's waits are written once ([7bc1a11](https://github.com/cgoinglove/thursday/commit/7bc1a11ae6c8d4426dde01a4f2c076784fd8eb6e))
* **workspace:** the workspace and finished-work screens name their folders from PATHS ([038347d](https://github.com/cgoinglove/thursday/commit/038347d439a1c251469a396d2287d4bcf129b2a6))


### Docs

* **bot:** the crew's "+" tail no longer says filled brand is what waits on the user ([bcbc4b4](https://github.com/cgoinglove/thursday/commit/bcbc4b4d41221a4fdbe87527e2f2dd7789d30bd6))
* **config:** next.config says what the /artifacts/… redirect is for ([9c1e937](https://github.com/cgoinglove/thursday/commit/9c1e93722b9594dedbd621bde7d90c1233f3817d))
* **readme:** a Discord badge and a line to ask a question there ([2aace1b](https://github.com/cgoinglove/thursday/commit/2aace1b795c35d48201b13e0a47d7e2adf21af58))
* **search:** the searcher's comment says a step's row reads its pages back out of the text ([8c7fdfa](https://github.com/cgoinglove/thursday/commit/8c7fdfaf8e51777c6f9600cdfe3bd73c1484d9bb))
* **workspace:** the workspace section's glyph map no longer claims to be the only place a kind is drawn ([35e8422](https://github.com/cgoinglove/thursday/commit/35e8422ad869f329244d2d0d167bc1c6c086e1fb))

## [0.15.0](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.14.1...thursday-agent-v0.15.0) (2026-09-25)


### Features

* **bot:** a bot's own line follows the user's description instead of replacing it ([11e3d86](https://github.com/cgoinglove/thursday/commit/11e3d862d4aac292e5fdd16e4311fca5e07587e5))
* **bot:** the roster holds fourteen bots, and ready-made ones stop at what fits ([d3b67e9](https://github.com/cgoinglove/thursday/commit/d3b67e99e2100dab52d85b013710f51cdc2b572e))
* **reach:** her words reach each chat app in its own marks ([8efa253](https://github.com/cgoinglove/thursday/commit/8efa253c6b3a4f0b146940176f496b028d83da99))
* **reach:** nothing written while waiting is lost, a question outlives the screen, and a token given again keeps its person ([ca759f7](https://github.com/cgoinglove/thursday/commit/ca759f787c077a0066ef7f0b4e076696c04ff7d6))
* **skills:** a bot decides who a new skill is for, and asks before it installs one ([9eaf266](https://github.com/cgoinglove/thursday/commit/9eaf2667f15e7d510b2f261340f81d19d3644747))
* **skills:** the page skill folds into artifact, which routes every kind it makes ([f6fa9cb](https://github.com/cgoinglove/thursday/commit/f6fa9cb5e26fbaa5b192ab107fcc344abbe8d03a))
* **skills:** trips are the Concierge's own, and the weather and money are every bot's ([aa67184](https://github.com/cgoinglove/thursday/commit/aa67184dbd95d1513c3133d0bb3ccbe5150576a3))


### Fixes

* **ai:** a thinking step the model does not take is dropped with one write, not one per render ([62249ac](https://github.com/cgoinglove/thursday/commit/62249ac81e9c110ef67cdd473f667911aba4d731))
* **bot:** a trip's search stays with the Concierge rather than going to another bot ([f565382](https://github.com/cgoinglove/thursday/commit/f5653822cef1f44efe80cce5bdfdf5a069fb980a))
* **bot:** marks read their boxes in one pass, not one layout per mark per frame ([be774a8](https://github.com/cgoinglove/thursday/commit/be774a8c90df1c96306c7d39a3ac66b3cd4fe074))
* **bot:** the thread menu's icon button has a name a screen reader can say ([0476fbe](https://github.com/cgoinglove/thursday/commit/0476fbe391ca87dacc706b38cac5137672646fff))
* **bot:** the Tutor seed's description fits the form it is edited in ([2e5de23](https://github.com/cgoinglove/thursday/commit/2e5de23ac0a1b3e055bceedc2a9b15162f624333))
* **bot:** WriteOrb's fade has one length, and its comment names it ([8758652](https://github.com/cgoinglove/thursday/commit/8758652b6d9417708af17f55b50ca7c53c4b63e5))
* **call:** a call in writing says when it could not record a relay as delivered ([a4c5308](https://github.com/cgoinglove/thursday/commit/a4c530845b6a3a9320791049773e76574fdaac3e))
* **call:** a first call no longer asks a stranger how old they are ([9a936a8](https://github.com/cgoinglove/thursday/commit/9a936a87032928efb14c04ac641e9901e4cff5a2))
* **call:** deleteCallAction checks the id it is given, as the other call actions do ([60b4bc2](https://github.com/cgoinglove/thursday/commit/60b4bc2515575d41213e93ce717177faf072af7b))
* **chatgpt:** the sign-in button watches its window as long as the server waits, read from config ([1d1998f](https://github.com/cgoinglove/thursday/commit/1d1998f5f4b0238194e288230563a8fa29ff7b7b))
* **connectors:** the button that removes a header or env row has a name a screen reader says ([67c8af9](https://github.com/cgoinglove/thursday/commit/67c8af92f8be08e82ffdeb7b8709a21ebd71bdae))
* **database:** the one client hands close, sync and reconnect through to libsql ([46afddb](https://github.com/cgoinglove/thursday/commit/46afddb5a80040b1e395563fe970b89f28d68b02))
* **files:** a text names the files it names, and no guess fills in the ones between ([a08d63f](https://github.com/cgoinglove/thursday/commit/a08d63fd662db1fb090bb040000aa2ea8d0764f0))
* **markdown:** bold that ends in punctuation closes before a Chinese, Japanese or Korean letter ([8f878b6](https://github.com/cgoinglove/thursday/commit/8f878b6d2845fcdff613e6371ce8139aae0a55b3))
* **mcp:** one server's route reads its name as Next hands it, decoded once ([f4bd6f9](https://github.com/cgoinglove/thursday/commit/f4bd6f980a6ede4af6cb1694da34eb2bb4eb1194))
* **memory:** Enter that finishes a composed character in a new note's Summary no longer creates the note ([5d3a806](https://github.com/cgoinglove/thursday/commit/5d3a806eb4ff5536d88fd0b5b12a3b5384bfeba2))
* **prompts:** the backend is not told to keep the word seen from the user ([630fd3c](https://github.com/cgoinglove/thursday/commit/630fd3cdfa9dee5d9d95ccbbdffcc4a34115b605))
* **protocol:** useServerAction and useServerPages write their refs after commit ([ea89bb9](https://github.com/cgoinglove/thursday/commit/ea89bb9878600a7febea2708e0db445f45f53926))
* **reach:** a phone's ask that fails to save says so ([0d0d47d](https://github.com/cgoinglove/thursday/commit/0d0d47d3d752999ec48067334b0ac59bdc864264))
* **reach:** Discord's steps keep the bot to its owner and say how a phone writes to it ([3013dd4](https://github.com/cgoinglove/thursday/commit/3013dd488ef4350418c71c81b93d5368f719adff))
* **reach:** only a picture Telegram refuses as a photo goes again as a file ([93dd7a2](https://github.com/cgoinglove/thursday/commit/93dd7a26218bd31001c3494453c9b6c14648642f))
* **skills:** pages name no Chinese, Japanese or Korean face, so each script gets its own ([13f8ba4](https://github.com/cgoinglove/thursday/commit/13f8ba4cf9e17ab31e245cac1cc8bdfd9f959161))
* **skills:** the brief's preferences file holds only what the reader likes ([cbc059b](https://github.com/cgoinglove/thursday/commit/cbc059be65fd6849cc8746029d365ff5a056c520))
* **travel:** a trip page writes its prices as its language does, and names their currency ([a40b822](https://github.com/cgoinglove/thursday/commit/a40b822b86612a9564863e3b73703b384bfcb0c8))
* **travel:** a trip's costs are numbers, or the page would print a total of nothing ([091b12e](https://github.com/cgoinglove/thursday/commit/091b12e15eeef3fcd2ca65da1c3baac682a311b6))
* **ui:** Japanese and Chinese are drawn in their own fonts, not the Korean one ([b5287e0](https://github.com/cgoinglove/thursday/commit/b5287e07edb392313920dc30455dcb1a36b4e8a8))
* **ui:** Japanese and Chinese prose wraps where Korean keeps its words whole ([be5f2e9](https://github.com/cgoinglove/thursday/commit/be5f2e9e785c1288d4c756cce609a18790c30c25))
* **ui:** useDraft keeps the Enter that confirms a composed character on Safari ([dd8ecfe](https://github.com/cgoinglove/thursday/commit/dd8ecfe89695087336713e0443b997b5682610c1))
* **workspace:** a job's or a deleted bot's folder that cannot be removed says so in the log ([9e8138b](https://github.com/cgoinglove/thursday/commit/9e8138bf2529bdfb917eb737f0f57f246dabdee7))


### Performance

* **call:** an ascii face's connect wave draws no emoji sheet as the call picks up ([63fb883](https://github.com/cgoinglove/thursday/commit/63fb883cb49f921b11ba5c31c0bc3d52528801b8))


### Under the hood

* **ai:** a run reads the gateway's shelf through one runCatalog ([6d521cc](https://github.com/cgoinglove/thursday/commit/6d521cc1d4b4fc520e9444a33a7c85453ad62c5f))
* **bot:** a bot's icon becomes BotMark props in one place, beside BotMark ([ca40ef8](https://github.com/cgoinglove/thursday/commit/ca40ef851b698fa421c6b22d641de2b2ced4978d))
* **bot:** a compaction the user asked for has its own name in prepareStep ([6996b0f](https://github.com/cgoinglove/thursday/commit/6996b0f4a45371d9d34ee88693e8c957c5eaf727))
* **bot:** an empty summary throws a plain error, since nothing reads isRetryable ([8b10c6f](https://github.com/cgoinglove/thursday/commit/8b10c6f24ba775021cd6a7b822b14d0c2c136927))
* **bot:** an unread ending is one rule in bot.schema, beside needsThreadReply ([d95c44e](https://github.com/cgoinglove/thursday/commit/d95c44e9a315b924fcee47bbaff4ea7cc6626baf))
* **bot:** resumeRoom always starts a new generation, as its one caller asked ([39f2603](https://github.com/cgoinglove/thursday/commit/39f2603a4634491a22fabec0f70418df6b2e80e5))
* **bot:** the bot name schema carries no commented-out rule ([06d0790](https://github.com/cgoinglove/thursday/commit/06d0790c9e6bbcde28f998c8ac6a7508f7b620b7))
* **bot:** the pinned-tool budget, how far back a label finds a thread and the full-result cap are config.ts constants ([cb94571](https://github.com/cgoinglove/thursday/commit/cb94571e56316a0fe8ea8b88f7bc0476439bd058))
* **bot:** the room reads needsThreadReply under its own name ([17f1827](https://github.com/cgoinglove/thursday/commit/17f18277ef0b0bafd14cff40d38fbc1594f0e85a))
* **bot:** the thread actions import room.query at the top, as bot.runner does ([ded6488](https://github.com/cgoinglove/thursday/commit/ded648801e997047169a34812a00d4ddd384b533))
* **call:** how long the activity line holds a finished step is a config.ts constant, one for both calls ([4f76d64](https://github.com/cgoinglove/thursday/commit/4f76d64f434378c711a709bc25c90fd37f07df70))
* **call:** the call page's scrollback, save retries and inbox poll are config.ts constants ([f05afd4](https://github.com/cgoinglove/thursday/commit/f05afd44d84bfe9a891582b970caa33d05c4619c))
* **call:** the pages of a search are read from its answer once, not parsed twice ([5241ed5](https://github.com/cgoinglove/thursday/commit/5241ed514734bac82e04cf5befd9d5300dbf82cc))
* **call:** the reasoning a chosen effort asks for is worked out in one place ([2f20f12](https://github.com/cgoinglove/thursday/commit/2f20f1254173208995ce65184e83b0a670f6b17f))
* **call:** the silent voice has as many bands as the audio tap ([620098f](https://github.com/cgoinglove/thursday/commit/620098f6f1ea33af0bcbf35ec4fed20b745f4ef7))
* **call:** the tool-call route and a call's opening set take their defaults from LIVE_DEFAULTS ([dd0cb48](https://github.com/cgoinglove/thursday/commit/dd0cb487d1cc3afaee61f97ebd80cdffe27be62d))
* **config:** the caps on a bot's name, lines and prompts are in config.ts, with what moving them does ([f718101](https://github.com/cgoinglove/thursday/commit/f718101b81291bb3f5e61080987e5dfadf91e754))
* **config:** the database's path on disk is config.ts DB_PATH, and dev reads DATA_DIR from there ([7bfb487](https://github.com/cgoinglove/thursday/commit/7bfb4877eb376e91ab6710dd3fa801d5c730569f))
* **config:** the shortest key the app takes is KEY_MIN in config.ts, read by the save and every field ([be2e97d](https://github.com/cgoinglove/thursday/commit/be2e97d5a7fd14c2d89114789c8436ec65768700))
* **connectors:** how long an idle MCP session stays open is config.ts MCP_IDLE_MS ([9ffb610](https://github.com/cgoinglove/thursday/commit/9ffb610d3dcbca9446cedca7079c12d579106740))
* **events:** how often a signal goes down the event stream is a config.ts constant ([692277d](https://github.com/cgoinglove/thursday/commit/692277d37d32cf6b2300e66da5f34a97996b57c2))
* **hooks:** useObjectState returns one patch function, without per-key setters ([15f5c77](https://github.com/cgoinglove/thursday/commit/15f5c771c36ecbb417c33365b5b19970871a995d))
* **memory:** a Memory-screen edit's step limit is config.ts MEMORY_EDIT.maxSteps ([82473bb](https://github.com/cgoinglove/thursday/commit/82473bb0d1447e817efa77a5697e56c78574fcc9))
* **memory:** memory's transactions wait in the database's one lane, not in a second lock of their own ([b65f21f](https://github.com/cgoinglove/thursday/commit/b65f21fb837b61c16008d1c26dc860dc4615f8d3))
* **memory:** the always-listed notes are the root notes MEMORY_PATHS names, not a second list ([6901fb3](https://github.com/cgoinglove/thursday/commit/6901fb3f417d78433a03db836737530e115bfd73))
* **models:** how long the gateway catalog is believed is config.ts GATEWAY_CATALOG_MS ([993e9ef](https://github.com/cgoinglove/thursday/commit/993e9efd83cb9539bf75e4e0ddbd44fb5f3451b9))
* **protocol:** a streamed route that fails before it starts answers through one startError ([851b19b](https://github.com/cgoinglove/thursday/commit/851b19b5eb1bcc3f88836efff376adff9dc2618a))
* **protocol:** paged reads spread READ_DEFAULTS instead of a copy of it ([530e448](https://github.com/cgoinglove/thursday/commit/530e4481da3ca4804c2b5a39c7a31858c7ef34e5))
* **reach:** the wait that makes a burst of thread changes one look is REACH.lookMs ([635c790](https://github.com/cgoinglove/thursday/commit/635c790cbbf8ab5003b5449fbdee7447c5cf68f8))
* **routine:** the routine sheet takes its day names and its whole week from the schema ([087e806](https://github.com/cgoinglove/thursday/commit/087e806b1bf28d5ee03ef2790a52d8abd5ddf251))
* **settings:** a section's alert is "red" or "waiting", the colour it is drawn in ([72674b3](https://github.com/cgoinglove/thursday/commit/72674b36df05ba105e42480b5a32f4ee628b1e2f))
* **skills:** a script reads another's result as an exit code or JSON, not its sentences ([be68bcf](https://github.com/cgoinglove/thursday/commit/be68bcf9e3105559a3468448af808df1cadc6c6d))
* **skills:** an uploaded skill crosses as FormData, as files given on the write line do ([80ff49d](https://github.com/cgoinglove/thursday/commit/80ff49ddd2385e612b75d38bb8a92608438155ea))
* **skills:** decks and canvases shoot through render's shot mode, and render serves through serve.mjs ([7a9adab](https://github.com/cgoinglove/thursday/commit/7a9adabf2b34c448b4b3fd0bd75f79c3f5d9d5c1))
* **skills:** the artifact scripts find their workspace in one place, and a whole artifacts path is kept whole ([811a9a7](https://github.com/cgoinglove/thursday/commit/811a9a71349f74839088bed3b8d9438a839d1fa8))
* **skills:** the output a bash call shows reaches the scripts from config, not as a copied number ([ab22103](https://github.com/cgoinglove/thursday/commit/ab221031d778a86348ac6052d923f5a48b34bc14))
* **tools:** tool_search's cap and the lengths the thread and routine tools clip to are config.ts constants ([c7711e5](https://github.com/cgoinglove/thursday/commit/c7711e5f42cd7cdf95ce0f45616253735d4a7d6e))
* **types:** a relay's kind and a call turn's role are spelled once, in their schema ([997effd](https://github.com/cgoinglove/thursday/commit/997effd510ff76924e14e24b0731155a43e70dfa))
* **utils:** hostOf lives in lib/utils, where the call prompt can use it too ([69d37de](https://github.com/cgoinglove/thursday/commit/69d37de2949f1baad90ff0270dd77aecb46e4d09))
* **workspace:** a job's folder and a studio file take their readable name from one slug ([69ba28d](https://github.com/cgoinglove/thursday/commit/69ba28d7111b656cc716726ec4bc72bdbd0f345c))
* **workspace:** the cap on files read from a job's folder is a config.ts constant ([1a31148](https://github.com/cgoinglove/thursday/commit/1a31148fdc02ad1c9aa497db2b063af163866ce6))


### Docs

* **agents:** nothing of one country goes in, nothing is forced, every change has a ground, and a wrong rule is asked about ([8e9f914](https://github.com/cgoinglove/thursday/commit/8e9f914eeb12dd8d78532e1b2fb7eb56d7b26d34))
* **bot:** a thread with no tab kept is on its own bot's tab, not on All ([0b767ed](https://github.com/cgoinglove/thursday/commit/0b767ed30c23fae1e4b847cba277b3512b936f38))
* **bot:** comments name only the stops the app still makes ([782b6d4](https://github.com/cgoinglove/thursday/commit/782b6d46c6363451ed7f7d9ab85ce36fd9554a94))
* **bot:** the mark's notify prop is described once, as the boolean it is ([a26a75b](https://github.com/cgoinglove/thursday/commit/a26a75b8c21905b7ec57c59f757b6bd5b552d812))
* **bot:** the room pump says why it claims twice ([947fe02](https://github.com/cgoinglove/thursday/commit/947fe020eacc3000727928035b48a279f147da56))
* **call:** CallScreen's comment names the calls that drive it ([10a68f5](https://github.com/cgoinglove/thursday/commit/10a68f5f24b39b554742511fdf1e882bd4d4a015))
* **call:** the call settings' comments say what is true since the settings moved to the server ([31608ec](https://github.com/cgoinglove/thursday/commit/31608eca6e92cf4d21923c034b4f3e7d1b7d435b))
* **connectors:** the presets' comment no longer promises two stdio entries that drive a browser ([5f828d5](https://github.com/cgoinglove/thursday/commit/5f828d5f64ec9b0d1de3a9bfe60556b041a472f4))
* **guide:** a bot keeps a skill to itself when it serves its own work ([2bf3499](https://github.com/cgoinglove/thursday/commit/2bf34994bf8b1fd579bd35fb592f6c9bbe8b00d9))
* **memory:** a Memory-screen edit is said to get memory's own read and writes, not "two writes" ([1dcbd65](https://github.com/cgoinglove/thursday/commit/1dcbd65c52788097e2d9889c1e1f4717624d5c3b))
* **prompts:** nowLine's example sits on nowLine again, not on botWorkHead ([f602ed3](https://github.com/cgoinglove/thursday/commit/f602ed3dc81b810261eb393c1b541d3b9e06c538))
* **security:** a kept sign-in is in .sign-ins and lent by the tool, not in a bot's folder ([eebd63f](https://github.com/cgoinglove/thursday/commit/eebd63fa1529f67aca6797a6e10ce2e0eabc6018))
* **settings:** the section shortcut's comment says Cmd+1..9, as the handler does ([a99d218](https://github.com/cgoinglove/thursday/commit/a99d218e6280d3e512d9ab895f528edf3b25b986))
* **skills:** data-report's worked examples are in several currencies, not all in won ([88087e1](https://github.com/cgoinglove/thursday/commit/88087e160cd4e584578d54f474c7e0faeb9ff29d))

## [0.14.1](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.14.0...thursday-agent-v0.14.1) (2026-09-25)


### Fixes

* **call:** a backend a browser's copy named by default follows the app's default ([a88124c](https://github.com/cgoinglove/thursday/commit/a88124c20e0e32be592b15a526d2ad9976bc2d5e))
* **call:** a profile left empty after earlier calls opens with a greeting, not a silence ([a96054a](https://github.com/cgoinglove/thursday/commit/a96054ad8da9358cc56e102bfbdbce72ed268341))
* **call:** an answer offered on the ringing screen answers the bot ([bedcc48](https://github.com/cgoinglove/thursday/commit/bedcc487a7536048419b3c268d73f186f77e0d6b))
* **call:** an opening cut short by a call or her voice winds down instead of being dropped ([7b449e7](https://github.com/cgoinglove/thursday/commit/7b449e75b05639b217c275ce2cad55496324fdd8))
* **call:** her answers in writing keep their lines, and what she names opens ([f136a9f](https://github.com/cgoinglove/thursday/commit/f136a9fbfb6e379097b4246fe95c7e25e71bf3ae))
* **cli:** the server listens on 127.0.0.1 whatever HOSTNAME the environment exports ([45dbf7c](https://github.com/cgoinglove/thursday/commit/45dbf7cc9b7017d6a055cd149fec52f20c91e334))
* **files:** finished work opens and deletes under a data folder reached through a symlink ([6dab2e5](https://github.com/cgoinglove/thursday/commit/6dab2e53958a8cd96c4bc645881cfddbebca5af8))
* **files:** thumbnails load again: the image optimizer's own request passes the host check ([ea361f0](https://github.com/cgoinglove/thursday/commit/ea361f0d9322ba4e03d16f4ea332d4751caaafc3))
* **intro:** the style step is said aloud too ([68b8165](https://github.com/cgoinglove/thursday/commit/68b8165900d08b497a85c692591a216e7a14a348))
* **models:** a gateway model is asked what it sees by the provider behind the gateway's name ([b7a5732](https://github.com/cgoinglove/thursday/commit/b7a573205e91e7684174f2b6a9ae9b7dc67862ca))
* **reach:** letting someone in takes the code their phone was sent, and a stopped service says so ([31a383b](https://github.com/cgoinglove/thursday/commit/31a383b3257733c1ef9984a5e1fa13e75e85b6c0))
* **reach:** what fails between a phone and the app is said, and a dead line is dialled again ([b3fc0ba](https://github.com/cgoinglove/thursday/commit/b3fc0baf3f1a4f68c05aa870e01402f0a364618b))
* **skills:** a chart drawn into a document is kept as the bot's own put, and a board copies its own note ([8b7199e](https://github.com/cgoinglove/thursday/commit/8b7199eb1a984661a16d0602322944e5356752b6))
* **skills:** a chart drawn under an id no empty figure waits for is turned away ([5c3407e](https://github.com/cgoinglove/thursday/commit/5c3407e18f08a781634b72952c86e79ad201e3a5))
* **skills:** a social study reads a few accounts chosen with the user, and small leftovers go ([07ce2aa](https://github.com/cgoinglove/thursday/commit/07ce2aa903745810878c29b5d9b1f7672e9a67a0))
* **skills:** a trip's flights come from Kiwi when it is connected, and its searches open on the user's screen ([899515e](https://github.com/cgoinglove/thursday/commit/899515e7fef9e9fcde24333948b060ec9f661973))
* **skills:** a wall is the site's answer, and local pages are served by the skill's own script ([3055df0](https://github.com/cgoinglove/thursday/commit/3055df04905f3d8b2b5bc779bd3e5967e306a91a))
* **skills:** on Linux a browser missing its system libraries is named, and how to install them ([c3d41bc](https://github.com/cgoinglove/thursday/commit/c3d41bcf871aaf8b6538256fa87d186ac6031f28))
* **skills:** Settings › Skills shows a description as its YAML says it, and names its delete button ([60b9ee6](https://github.com/cgoinglove/thursday/commit/60b9ee6c4a95ba5bdedc803256723540d121c95a))
* **skills:** the analyst skills stand on published sources and leave choosing to the bot ([77bf1a4](https://github.com/cgoinglove/thursday/commit/77bf1a40a3f94753d91f8bafe169715532247a4f))
* **text-call:** look_at is held only by a model a picture in a tool result reaches ([176615d](https://github.com/cgoinglove/thursday/commit/176615d818009d4f561aafe2d90201f1fa77922c))


### Docs

* **maps:** a dialog that opens by itself to grant something starts on cancel ([b458a4a](https://github.com/cgoinglove/thursday/commit/b458a4a4375d5a6712d845b0ad099a5843483077))

## [0.14.0](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.13.0...thursday-agent-v0.14.0) (2026-09-24)


### Features

* **bot:** a bot rewrites the line it is picked by, and the user can lock it ([e79564f](https://github.com/cgoinglove/thursday/commit/e79564f031d036359a4b6fc5c6dffbb40fc01c42))
* **bot:** a deck comes back to the bot as a picture of every slide, and a path in its own folder makes one ([f94e528](https://github.com/cgoinglove/thursday/commit/f94e5287f2bb4d87a1af6987791edd8c8f10a1d7))
* **bot:** Curator and Concierge join the ready-made bots, and the Analyst keeps to finding out ([7bcaaa9](https://github.com/cgoinglove/thursday/commit/7bcaaa9ea6887b583073b8bdea9cb296fff1cd36))
* **bot:** every bot makes a deck from typed slides the app draws ([dee41fa](https://github.com/cgoinglove/thursday/commit/dee41facbc35b0d8eacc4ef83357016f8a57503f))
* **bot:** questions a bot waits on stand on the write line while it is up ([bf9f1c5](https://github.com/cgoinglove/thursday/commit/bf9f1c5e0da4d949f969ca69c1eb0ae58eb91982))
* **bots:** a message says why it was sent, and an answer stops repeating itself ([43cf7b3](https://github.com/cgoinglove/thursday/commit/43cf7b325123ea7b737a7478dc3430610546123b))
* **bots:** the message box says who it is addressed to, and where that bot's answer lands ([c9e0466](https://github.com/cgoinglove/thursday/commit/c9e0466bd768b92e23fde10ad164b532b9e81b64))
* **bots:** work runs for as long as the server does, watched or not ([183befb](https://github.com/cgoinglove/thursday/commit/183befb81218003b63b6d4cef98256f313cf2507))
* **bot:** the Marketer carries one marketing skill of its own, and no other bot pays for it ([1118d43](https://github.com/cgoinglove/thursday/commit/1118d43212c84f3852548a9afa490dcdbc5b8fc7))
* **browser:** render shoots each slide at its own size when no size is given ([caa7436](https://github.com/cgoinglove/thursday/commit/caa7436e4d0896f45bd35ea4a64288e40287661a))
* **call:** a call in writing hears a bot's update at once, and words written mid-answer join it ([7fd7536](https://github.com/cgoinglove/thursday/commit/7fd7536df0cbd7befa138132d99d168d6f5fe532))
* **call:** a friend first, and the user's own box is her personality ([6e95ffa](https://github.com/cgoinglove/thursday/commit/6e95ffaadbad36122074d5d38447e8f576a1de2f))
* **call:** a persona carries the name and line a picker shows, and names no voice ([12e2c0d](https://github.com/cgoinglove/thursday/commit/12e2c0d7fb3d414b944d71f665e12b41d19c96db))
* **call:** four more personas — rough, charmer, deadpan, hype — so the set is not one temperature ([dcaf597](https://github.com/cgoinglove/thursday/commit/dcaf597108cbbf14b44e70ffcb6f3f6c2d774042))
* **call:** her face can come in waking, eyes open at once and one wash through her ([a7a3889](https://github.com/cgoinglove/thursday/commit/a7a38892ad567d1391e67614e501f160fc1c01e2))
* **call:** her resting face is an ember, and it opens its eyes ([e32bcd4](https://github.com/cgoinglove/thursday/commit/e32bcd41f7b0a7d90274d31dc5056030e4f594de))
* **call:** her resting face, as it was picked ([4086610](https://github.com/cgoinglove/thursday/commit/408661097004f2e1cff6875aaf1c38df2f0957bd))
* **call:** her style is something you pick, in the intro and in Settings ([4a37f3e](https://github.com/cgoinglove/thursday/commit/4a37f3e4c6ee30cef071f9934df6db93b94b04ed))
* **call:** part of her face washes to another set of glyphs ([ede3308](https://github.com/cgoinglove/thursday/commit/ede3308516ccdc8ded96166437fe17f9d12e4b0f))
* **call:** she keeps how things landed with them and what they are going through, not only facts ([bf802ee](https://github.com/cgoinglove/thursday/commit/bf802ee9d389023afd09f3978e64de1a5372bd0b))
* **call:** she rests as smoke, wakes with a sigh and falls asleep ([0e90dd1](https://github.com/cgoinglove/thursday/commit/0e90dd1a2eec2f0e2428e52423edb6360be143ea))
* **call:** she wakes one of sixteen ways, as the app opens and each time after ([29c63f0](https://github.com/cgoinglove/thursday/commit/29c63f0b4ac2a7917364369d54cf2bfbb35d014c))
* **call:** who she is is the app's, not one browser's ([3c590eb](https://github.com/cgoinglove/thursday/commit/3c590eb0b4fe8d3b8bbb10e6e6a01f4cc2e6648b))
* **call:** who she is to talk to — a persona under the identity, the ending rule gone, one thing about them in the greeting ([d0f41d0](https://github.com/cgoinglove/thursday/commit/d0f41d0fc783d5f5aa17d91fbaa2a89f69d76c85))
* **cli:** `thursday autostart` keeps the server up from login on ([e9421a7](https://github.com/cgoinglove/thursday/commit/e9421a7ee0f3b85f470cd6b021b421c87d14fb13))
* how hard a model thinks is set per bot and per call, with what several sessions left finished ([4412b38](https://github.com/cgoinglove/thursday/commit/4412b38b16fd7eee8c14e63459e6991d8fa67e83))
* **intro:** the first run opens on her coming down to her own size ([47b1cde](https://github.com/cgoinglove/thursday/commit/47b1cded6b717810cb3d413ff96370e10b80cf4e))
* **models:** GPT-6 Luna and Sol, Claude Opus 5.5 and Grok 4.7 replace the models before them ([595d6f3](https://github.com/cgoinglove/thursday/commit/595d6f31a35238fd9f76b95ecea206404ea3471b))
* **reach:** a page goes to a phone with pictures of it ([0a15085](https://github.com/cgoinglove/thursday/commit/0a15085381968fd2d37f8c20fb18224735c121cb))
* **reach:** the fact she is left says when ([19cd6cf](https://github.com/cgoinglove/thursday/commit/19cd6cfbddd102d22637305288bbcfde486b9d36))
* **reach:** work comes back to the phone as the bot wrote it, at once ([d83a488](https://github.com/cgoinglove/thursday/commit/d83a4887e5000ae8ca48a2a9edcc94bcc4fe2587))
* **seed-skills:** a deck written as slides comes out as a PowerPoint file ([e8f78b4](https://github.com/cgoinglove/thursday/commit/e8f78b4bb439710129a198fb280941d5f9486160))
* **seeds:** a board on the canvas says what it is made of ([d3b3956](https://github.com/cgoinglove/thursday/commit/d3b395612534842a6e8f428290135d9ce6d5ba65))
* **seeds:** Designer's canvas kit, which its role already names ([aa6b008](https://github.com/cgoinglove/thursday/commit/aa6b008baa0b7dede45e1c3a44c5fd221cf476d6))
* **seeds:** Docs is no longer offered ([a431aae](https://github.com/cgoinglove/thursday/commit/a431aae65c87ae085daf531e060d67cddd875afa))
* **signins:** a sign-in window closes once the sign-in is kept, and the job goes on unseen ([a323a5c](https://github.com/cgoinglove/thursday/commit/a323a5c4d2a085b3d13fca31b2162fdbde1b86d4))
* **signins:** the list says a bot can work in the user's own Chrome ([aa196b6](https://github.com/cgoinglove/thursday/commit/aa196b67956b034c87af8219b584cc3dd2e07740))
* **skills:** a bot puts what it wrote into a page, and never shoots it in the user's window ([f4f7635](https://github.com/cgoinglove/thursday/commit/f4f76354665dc3b83407f7326b6307be58a3f8a4))
* **skills:** a deck is edited where it stands — its words, notes, order and palette ([14bbc58](https://github.com/cgoinglove/thursday/commit/14bbc587f92472fe83c3d371f06ec920e71f6b23))
* **skills:** a deck of slides, beside the canvas in interactive-page ([e6010d4](https://github.com/cgoinglove/thursday/commit/e6010d4f7252d3da2a2a792dd59be7dcabaae825))
* **skills:** a deck starts from a slide that already works ([ec82f05](https://github.com/cgoinglove/thursday/commit/ec82f056c56d193b13b8c099eacb737473458dfe))
* **skills:** a deck turns instead of cutting ([7a44de6](https://github.com/cgoinglove/thursday/commit/7a44de6674004aad2014fcfbfebd0e1483556b40))
* **skills:** a deck, a canvas and a picture book come back with everything on one picture ([387774e](https://github.com/cgoinglove/thursday/commit/387774eb7e3c6dd09dd5a2d78d0ed356b44c3fc7))
* **skills:** a document takes `/`, Markdown's shorthand and a bar for its tables ([d60230a](https://github.com/cgoinglove/thursday/commit/d60230ad5431ad26b9a21bd3747e0be2b3703c2e))
* **skills:** a document's chips are pieces in its editor, and a page in its own tab is only itself ([904fc25](https://github.com/cgoinglove/thursday/commit/904fc2573a8d2d2f04a3829b5be41f90983ca085))
* **skills:** a page a bot writes wears its own head — deck, document, canvas ([6d12d49](https://github.com/cgoinglove/thursday/commit/6d12d492d66dbcb2c1caddbd88f05dca209cd6ea))
* **skills:** a page is one to read — the React kit that built tools is gone ([2f59ce6](https://github.com/cgoinglove/thursday/commit/2f59ce6581d7eaf65e8b184382b2fc267eafa8d1))
* **skills:** artifact — a document, a canvas, a picture book and a deck as one skill ([654abee](https://github.com/cgoinglove/thursday/commit/654abeec7a8b9d940db5b88866fb01af990a7886))
* **skills:** design, slides and documents — three formats a bot starts from ready parts ([24f56c8](https://github.com/cgoinglove/thursday/commit/24f56c867931982c80f396dec573cb2fd10d3349))
* **skills:** every skill ships to every bot, and a ready-made bot is its role ([b86ef4c](https://github.com/cgoinglove/thursday/commit/b86ef4ced5087efad2354fbaf3f03019772d1662))
* **skills:** find-skills and skill-creator from their upstreams, and a new skill's reach is asked ([b0f5b18](https://github.com/cgoinglove/thursday/commit/b0f5b18c611a0654ef5a2ad34e77884578f7a6de))
* **skills:** interactive-page builds a small React app again ([98d19e6](https://github.com/cgoinglove/thursday/commit/98d19e6c67a8f54cf6e192f6b50ee9e66aa5d8d9))
* **skills:** notes of the reader's own, pinned on a canvas ([3bbaf35](https://github.com/cgoinglove/thursday/commit/3bbaf35ccf95412ae8bb88e965b90b8daf61cb72))
* **skills:** the canvas is a surface, and its boards can be taken one at a time ([1acb154](https://github.com/cgoinglove/thursday/commit/1acb154cf700dd3b3da00a2f1513addca0dee91b))
* **ui:** one warm for what wants you, one rule for which corner a job stands in ([688e8b4](https://github.com/cgoinglove/thursday/commit/688e8b488eca889b360d033bec8f17068b2162c2))


### Fixes

* **ai:** recognize English mode aliases ([391bb7e](https://github.com/cgoinglove/thursday/commit/391bb7e6f51d3f1a747b6f23994e52252a6034c6))
* **bot:** Jarvis wears the theme's own ink, seeded or not ([2bb00bf](https://github.com/cgoinglove/thursday/commit/2bb00bfc2cd8713dd4cf57f54429e6c553dbe7d6))
* **bots:** a bot idle inside a running thread gets an open box, not Step in ([b12b7f7](https://github.com/cgoinglove/thursday/commit/b12b7f7824395c3d750e76b9a68821318e6e7ffd))
* **bots:** a desk's context is what the provider counted, not what its JSON is long ([112b6e8](https://github.com/cgoinglove/thursday/commit/112b6e836ee89d4bf0cf462844f68d12da7c8cea))
* **bots:** a face in the pill answers for its own bot, not its thread ([475a201](https://github.com/cgoinglove/thursday/commit/475a2010c61a4548405577f5c250c696815a4dcb))
* **bots:** a message is a call and a turn's last words are its return ([b082ff4](https://github.com/cgoinglove/thursday/commit/b082ff4a4539a287a474720f1cc9abe039a639c3))
* **bots:** a picture a bot looked at is stored as its path, not its bytes ([06b31d2](https://github.com/cgoinglove/thursday/commit/06b31d2b85ce54d96648764165e93a50f76dd615))
* **bot:** Stop says so where it can be found, and a stop always reaches the pill ([fd28713](https://github.com/cgoinglove/thursday/commit/fd287131f0cdf4902dc01ceb1c1819b32dba5315))
* **bot:** the Designer looks at what it made, and reads what exists only when the job names it ([03af68f](https://github.com/cgoinglove/thursday/commit/03af68f78194e371798ad17824221798a164912c))
* **bot:** the Designer's line no longer claims every page ([2bd5604](https://github.com/cgoinglove/thursday/commit/2bd560485b2f56767f368f27013efdabee2c96a6))
* **call:** a bot's update reaches the call after two quiet seconds, not seven ([d767a08](https://github.com/cgoinglove/thursday/commit/d767a0830717b56d930edf3305626a3fc0c5b755))
* **call:** a browser's copy of the settings keeps the skills switch it never held ([50643ae](https://github.com/cgoinglove/thursday/commit/50643ae361f1095cfbfcea2ee5759caa0371bfb0))
* **call:** a call in writing hears what is done on screen, and send it again keeps what she finished ([45086e0](https://github.com/cgoinglove/thursday/commit/45086e04c9f8567020d7ef95cb99a2227d108ed8))
* **call:** a call in writing keeps its own wait before a bot's update goes in ([b60384e](https://github.com/cgoinglove/thursday/commit/b60384e9d2dcb08eeb79968ecae72085a960115c))
* **call:** a call is about now — the last calls are reading, the thread list is the backend's, old work stays on screen ([8ef618e](https://github.com/cgoinglove/thursday/commit/8ef618ec6e5f610bea91c7c267b784fcfe070cc6))
* **call:** a persona has no name of its own — she is Thursday whichever is picked ([4031b23](https://github.com/cgoinglove/thursday/commit/4031b23579256d3b56cd660e22acb77ee73da735))
* **call:** a tool line says what it read, and clearing the corner reads it ([cdb2e38](https://github.com/cgoinglove/thursday/commit/cdb2e385256800813bb234c2bff734605aae4fbc))
* **call:** her eyes are a touch larger ([27b8ad5](https://github.com/cgoinglove/thursday/commit/27b8ad59e9d328b4f1a0f8ad05c882a0fc176541))
* **call:** she is a circle again, and her eyes are eyes ([dac1b0a](https://github.com/cgoinglove/thursday/commit/dac1b0aa01e57c925097f45c4e739a5389119f52))
* **call:** she is her own size again, and the wind is not always east ([6f189b6](https://github.com/cgoinglove/thursday/commit/6f189b630fe8e016fca55426dbeae0144ab7710a))
* **call:** the app opens plainly again, and the body closes around her eyes ([e30d393](https://github.com/cgoinglove/thursday/commit/e30d3933b9d34bd927057019a5f77e333aacd17c))
* **call:** the backchannel line goes back to the guide's own words ([048156b](https://github.com/cgoinglove/thursday/commit/048156b6a24233b9534f7b71a0332201fc39b926))
* **call:** the call's settings keep what was picked, so a new default reaches everyone else ([f162da3](https://github.com/cgoinglove/thursday/commit/f162da3f77425876705a1bf2157c14658c158ea6))
* **call:** the note's line says the note, and forgetting says what it always said ([e988fcb](https://github.com/cgoinglove/thursday/commit/e988fcbab286ff3971523ecdfc158a1fddfede5e))
* **call:** what to call them is a fact about them, not a manner ([c29a7f0](https://github.com/cgoinglove/thursday/commit/c29a7f034591d911e1ef029c4c32ab67467c0913))
* **call:** writing your own style is one of the list, not a button beside it ([ba1f7e8](https://github.com/cgoinglove/thursday/commit/ba1f7e8f4149f1035cdd9a0b15f84b1358b37445))
* **cli:** a checkout keeps its data in the checkout ([aa4f1a4](https://github.com/cgoinglove/thursday/commit/aa4f1a41edf422660bc023620f8e6bd014842397))
* **connectors:** Chrome DevTools is no longer a recommended server ([13ec591](https://github.com/cgoinglove/thursday/commit/13ec591f7b92c1dbc73408d51d7488831014ca8b))
* **connectors:** Playwright is no longer a recommended server ([1b14f37](https://github.com/cgoinglove/thursday/commit/1b14f3740da8d7335ea3e4cfda8e254709146c40))
* **guide:** the own-Chrome paragraphs stand where they were written ([f57fdc2](https://github.com/cgoinglove/thursday/commit/f57fdc2ff652351b13ab6de805b4fd069b9091d4))
* screens, comments and docs stop describing what the app no longer does ([7e9b807](https://github.com/cgoinglove/thursday/commit/7e9b8071f91ed260ddeed9393ca73cff73b024a1))
* **seeds:** a board's spec is the design, not the frame around it ([9cf203c](https://github.com/cgoinglove/thursday/commit/9cf203cc8f728bfd87799216820fb169ee0d61ba))
* **seeds:** the Instagram skill says the sign-in order too ([d64726c](https://github.com/cgoinglove/thursday/commit/d64726cdbe6947994925f719cc318728cf01dbe8))
* **signins:** a refused sign-in goes to the user's own Chrome, and the order is said right ([75f7ba6](https://github.com/cgoinglove/thursday/commit/75f7ba6f297a92c56dcfa169925e5d8ed1378f68))
* **skills:** a board keeps its list indent and inline icons; the shooters find the shipped skills beside them ([a5a1a57](https://github.com/cgoinglove/thursday/commit/a5a1a5704e77484ede96c9c04b3dee061483c24d))
* **skills:** a board that sets its own height cannot hide what overflows it ([57304e3](https://github.com/cgoinglove/thursday/commit/57304e3cc936f4b0b4ba0555769793775a79d7c2))
* **skills:** a bot that loads a skill is shown the files that ship with it ([02b4c0d](https://github.com/cgoinglove/thursday/commit/02b4c0d3054edbe997b8d22d18762fd7fc780b71))
* **skills:** a document's tab and head read its first heading ([ad6ce33](https://github.com/cgoinglove/thursday/commit/ad6ce33ccdb9cab1236359d4bce9b70140305df7))
* **skills:** a document's title keys are read without their fences too ([b0bf2b4](https://github.com/cgoinglove/thursday/commit/b0bf2b469c32d9d121897b72e914be9ab96a627c))
* **skills:** a page and its bot never undo each other's writes ([5ce8d73](https://github.com/cgoinglove/thursday/commit/5ce8d739bf188267d039a571681a5beb0775787e))
* **skills:** a page keeps its edits through the frame that shows it, and what a bot writes wins ([0ec3f49](https://github.com/cgoinglove/thursday/commit/0ec3f491022e27d94383c6738d6b116656148697))
* **skills:** a shot reaches work another bot made, and load_skill hands back paths that open ([3427ac8](https://github.com/cgoinglove/thursday/commit/3427ac8194d42d056629705bb1befad63b592ddc))
* **skills:** a skill switched off stays off in the user's config, not in its files ([bf62590](https://github.com/cgoinglove/thursday/commit/bf625907aee63a6a02d22c2f298c466d5d48a451))
* **skills:** a slide's heading stays put and its body fills what is left ([1a1ed89](https://github.com/cgoinglove/thursday/commit/1a1ed893142436956dd53bf3cf83c479770ab51c))
* **skills:** every skill says what it does in one sentence and when in one more ([68e4815](https://github.com/cgoinglove/thursday/commit/68e4815956e4566208aa9bb9ba7a898be30ff89c))
* **skills:** the picture book's video and the daily brief's look are shot apart from the user's window ([0745e36](https://github.com/cgoinglove/thursday/commit/0745e3636be704e97c7a4321e40a65db2c9636c5))
* **skills:** what a deck, a canvas and a document get wrong on screen ([3d1d7d7](https://github.com/cgoinglove/thursday/commit/3d1d7d710a9181f4cbc8e887eb9800b0be6ac382))
* the app answers this computer alone, and a page a bot wrote runs apart from it ([1259266](https://github.com/cgoinglove/thursday/commit/1259266e181008f6895c4d6f01c39a1da45971f8))
* **ui:** Continue is a secondary button, not a blue one ([412d8f3](https://github.com/cgoinglove/thursday/commit/412d8f361cc59594412bdd022eb8f63515ca3d47))
* **ui:** destructive turns a plain red — Tailwind red-600/red-500 ([c267445](https://github.com/cgoinglove/thursday/commit/c267445f229b0fb30d11c326d062791c5d3889e2))
* **ui:** Esc goes to the last thing opened, and the foot of the screen is one column ([2e22e13](https://github.com/cgoinglove/thursday/commit/2e22e13eb43ac909927e4b7e8a0ef69cd624a758))
* **ui:** Korean inside a mono label is Noto Sans KR, not the OS font ([13115cc](https://github.com/cgoinglove/thursday/commit/13115ccd87baf4356fe4105fc23f0e2dd01b11c4))
* **ui:** one message box at a time, and the room has the foot ([e75bc2e](https://github.com/cgoinglove/thursday/commit/e75bc2e0d831247b71c80581a8486892112690e9))
* **ui:** the corner shows one finished card, and reads only what it shows ([4875fdb](https://github.com/cgoinglove/thursday/commit/4875fdb8a24ba4362c100c030c2285f5653e8892))
* **ui:** the corner's file faces are square and fill the card's row ([a9a52f6](https://github.com/cgoinglove/thursday/commit/a9a52f6c2c5d71015c36f32f219974e318c87cc0))
* **ui:** the corners keep to a height, and the room says a call still waits behind it ([cea964f](https://github.com/cgoinglove/thursday/commit/cea964f5090b1bf49fdb1531615e298485551886))
* **ui:** the effort is a setting like the settings around it ([bdaedd3](https://github.com/cgoinglove/thursday/commit/bdaedd3b5462f51f08018e8f776463cdfc7a3fb2))
* **ui:** the effort's Auto presses rather than slides ([cc8c16e](https://github.com/cgoinglove/thursday/commit/cc8c16e5c128c43d1cedbb246f0ea5cd9689c9d0))
* **ui:** the pill is furniture, so it holds its corner when the line comes up ([f9b48e1](https://github.com/cgoinglove/thursday/commit/f9b48e1f040c8fd225fe4ea83de7beceb92086da))
* **ui:** three finished cards in front, the rest a pile behind them ([21afddc](https://github.com/cgoinglove/thursday/commit/21afddc8127710c2b42bcae2e07b2401883c2825))
* **workspace:** a file nothing here draws opens in its own program, and Reveal shows it in its folder ([f54927f](https://github.com/cgoinglove/thursday/commit/f54927f2adef9f3d08b6b01452a2c68e2710f26d))
* **workspace:** a one-slash scheme is a link prefix, not part of the path ([814921d](https://github.com/cgoinglove/thursday/commit/814921dfb6d18681594bd7bcb623aeaa6470ea72))
* **workspace:** a page opened on its own takes the keyboard, so a deck turns on the first arrow ([8869b73](https://github.com/cgoinglove/thursday/commit/8869b73c47005435f33a79385e769fd0955c32d6))
* **workspace:** a page save that cannot be written says so ([d14f75a](https://github.com/cgoinglove/thursday/commit/d14f75aceea3b4b1f5a8e364b0a540a5c3eedea7))
* **workspace:** a page's edits land in the file they were written from, even as its frame closes or moves on ([1fdc16d](https://github.com/cgoinglove/thursday/commit/1fdc16d3fca408bf43b5bcf96541777e416c11d0))
* **workspace:** a result the app cannot draw is still a result ([bace827](https://github.com/cgoinglove/thursday/commit/bace827e921a3a737bbc42db30531b729c30ab80))
* **workspace:** two saves of one page never share a file beside it ([ee3ddb1](https://github.com/cgoinglove/thursday/commit/ee3ddb13537f6ebb879002f6a0bef9ae5d2140a3))


### Performance

* **ui:** a file's face is optimized to its tile, and a report's pictures wait ([2534ab8](https://github.com/cgoinglove/thursday/commit/2534ab8a7f4877fa42715d2a2b3a42cce743bc9e))


### Under the hood

* **bot:** enhance visual transitions and state management for WriteOrb and CrewRow components ([d0ae595](https://github.com/cgoinglove/thursday/commit/d0ae595814c0463dffc05902bd3cf70cdefbd038))
* **memory:** a note is found by its path and its line — three writes, no aliases, no pins ([12dced4](https://github.com/cgoinglove/thursday/commit/12dced49f66768e934effde89f82edb358809c85))
* **prompts:** the thread tools say what they are, the prompt says when ([d1db0a8](https://github.com/cgoinglove/thursday/commit/d1db0a8a460243d0730f488e212de94aa0745271))
* **seed-skills:** the deck exporter stands on the kit's own browser ([b3f1b19](https://github.com/cgoinglove/thursday/commit/b3f1b197e64a94c115977b601a0aee007dd86c7c))
* **seeds:** six bots, roles that guide, kits that stand on public APIs ([d6e9820](https://github.com/cgoinglove/thursday/commit/d6e9820f4638e3ef9672a6a5aa6f83316c2eeeb9))
* **skills:** a skill says what it is in one sentence, and holds only what a bot cannot know ([d760929](https://github.com/cgoinglove/thursday/commit/d760929969455a0133145b3c3bd223ef6e3fc3a0))
* **skills:** the canvas moves into interactive-page, and Designer keeps the role ([5e80972](https://github.com/cgoinglove/thursday/commit/5e8097260f3b79755081d6228b3534cb037486e1))
* **ui:** streamline effort selection and enhance visual consistency ([d319c57](https://github.com/cgoinglove/thursday/commit/d319c57f17fd3c23a426039ab8433254864d9189))


### Docs

* a still hero, the providers in their own colours, fuller scenes ([c906775](https://github.com/cgoinglove/thursday/commit/c9067750a9d1d4aca4ee99cef84f2a2c6650f12e))
* **agents:** a map attaches only through the Read tool ([bb232a2](https://github.com/cgoinglove/thursday/commit/bb232a2c394cedddff8eb65cab2da55328100c72))
* **agents:** a map per area in .claude/rules, checked by pnpm lint ([f898a47](https://github.com/cgoinglove/thursday/commit/f898a47e7c1ab85a56e3712cc1d20fa4fb0f3678))
* **agents:** nothing about one user goes into the tree ([dd5221a](https://github.com/cgoinglove/thursday/commit/dd5221adf549156b3e54409e45d1d065720c047f))
* **agents:** the rules and the guide say what the code does today ([e218d10](https://github.com/cgoinglove/thursday/commit/e218d101910813edc0dcadd91d9b52c448792cac))
* **bots:** thread rooms say a message is a call and the last words its return ([47f1253](https://github.com/cgoinglove/thursday/commit/47f12532c70dbfe245829a4c904c6eac6998e453))
* drop the call and thread-room contracts ([faa8e30](https://github.com/cgoinglove/thursday/commit/faa8e30a71023d0028eb614a4eea65fcab81f04a))
* **readme:** the bots in the pictures are the bots the app installs ([cb187c5](https://github.com/cgoinglove/thursday/commit/cb187c500199f2f01e160c5f7047b3bffb15a2f2))
* **readme:** the scenes stand on a ground, and a bot's eyes are eyes ([ee07362](https://github.com/cgoinglove/thursday/commit/ee073620a6c3470ff62c18c708bb66ba2da5b393))
* rebuild the README as a product page ([fd854aa](https://github.com/cgoinglove/thursday/commit/fd854aa369030b56fdc0421c9c87fa32631039a9))
* **seeds:** the canvas says which of its two commands needs a browser ([6c0c4ca](https://github.com/cgoinglove/thursday/commit/6c0c4ca34ea134e72f61e59ac3de9b495650d0dd))
* **skills:** a page says how to look at itself ([033c388](https://github.com/cgoinglove/thursday/commit/033c3880b395d7338e82ff2dd7587a496a98b327))
* the subset check cannot build ([1268855](https://github.com/cgoinglove/thursday/commit/1268855b71d9f6c7aa32b2b02c471fca9439f5c1))

## [0.13.0](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.12.0...thursday-agent-v0.13.0) (2026-09-20)


### Features

* **bot:** the crew answers what happens to it ([c2b935e](https://github.com/cgoinglove/thursday/commit/c2b935e8fd9dd0a2bc9472f0f5aa66d7df84a723))
* **data:** what the app kept of its own use clears itself after three months ([a607a94](https://github.com/cgoinglove/thursday/commit/a607a943e6dd6c4ca1520d5ab8c54e1818c18b84))
* **reach:** each service names the way to its own bot, and Discord's invite is made for you ([4b68351](https://github.com/cgoinglove/thursday/commit/4b683516f1bcf228a799c1bee60da9692941221f))
* **reach:** the phone screen is its four steps, live, and a code the phone reads ([20ab91d](https://github.com/cgoinglove/thursday/commit/20ab91d1a6d5cd21d34202f19f92f7f85ce3b754))
* **seeds:** a picture book can draw a chart where a number is the point ([e3abf5d](https://github.com/cgoinglove/thursday/commit/e3abf5d387b74d6d67c6b9aba397bb219b1264d9))
* **seeds:** no ready-made bot coordinates the others ([df6ee02](https://github.com/cgoinglove/thursday/commit/df6ee0260b832af206e301d1f6619687459a145d))
* **skills:** a skill of your own is edited where it is read, and a routine's words wait for Save ([3877e21](https://github.com/cgoinglove/thursday/commit/3877e21f7f45569a69a1829e114ee106bd951036))
* **ui:** one ladder, one colour for what wants you ([a4aabbb](https://github.com/cgoinglove/thursday/commit/a4aabbb00fef69b1fe863f984a546f6d761a97e7))
* **ui:** what failed is a red-orange, not a red ([61aef5e](https://github.com/cgoinglove/thursday/commit/61aef5e201bbc036121d96505cf26a4814a67e93))


### Fixes

* **bot:** a face says what it has waiting — amber to answer, blue to read ([54e7893](https://github.com/cgoinglove/thursday/commit/54e7893577136b428ff107b09069a3faa3867896))
* **bot:** the corner holds every unread ending, and lets go of the read ones ([f9b5404](https://github.com/cgoinglove/thursday/commit/f9b5404d62a4d485f0db5940adba486225e6eb8d))
* **data:** the database is the owner's, kept when it will not open, and whole when copied ([9d39713](https://github.com/cgoinglove/thursday/commit/9d39713a9f6f6f041767ccb221e373a9f025eb82))
* **events:** the browser's line comes back, and a busy server stops starving it ([b0ffaed](https://github.com/cgoinglove/thursday/commit/b0ffaedaca991ea64cc5a4b8ee3c8aae22ac8dc8))
* **reach:** a phone line closes itself, and what waits survives a restart ([950f96b](https://github.com/cgoinglove/thursday/commit/950f96ba53b37282e2b7e5a24db325039ee94a38))
* **seeds:** a picture book drawn in SVG needs no browser ([73d5500](https://github.com/cgoinglove/thursday/commit/73d5500021c48e05e6b88b78c340b0b45d747229))
* **seeds:** Insta looks at what it copies, and asks the user for it ([45c73bd](https://github.com/cgoinglove/thursday/commit/45c73bdbefaec4fdd7195da9d91d16d3381c302c))
* **seeds:** the kits' examples stop assuming one country, and a book is looked at in one call ([f047106](https://github.com/cgoinglove/thursday/commit/f047106ad28aa916b298cfdd24e1555d42332191))
* **settings:** a column of numbers reads down, and two counts drop the paging word ([23aa2b6](https://github.com/cgoinglove/thursday/commit/23aa2b6dbcf2bf7122e9475b4804bfb3749f9cc4))
* **settings:** the screens nobody had gone through — edges, air, counts that disagreed ([87c3c47](https://github.com/cgoinglove/thursday/commit/87c3c474bb85bae027025b629df5dd0af99a19d5))
* **ui:** every settings index takes its picked row from the one constant ([0560ff4](https://github.com/cgoinglove/thursday/commit/0560ff4ff31c28c0df33223a838fe8075840ddc2))
* **ui:** the one button that is always round stays round at every size ([9069e8d](https://github.com/cgoinglove/thursday/commit/9069e8df4e899db5b2ae2aea28eb7574fb2f3dc5))
* **ui:** the room keeps its end in view, and the line says the other ways in ([ed4dd29](https://github.com/cgoinglove/thursday/commit/ed4dd291c95175163ae760bbcceed85121a09ade))
* **workspace:** a deleted bot takes its folder, and emptying scratch spares live jobs ([1ce8b2e](https://github.com/cgoinglove/thursday/commit/1ce8b2e420b74f0db36ae719db594abf4482c549))


### Performance

* **bot:** a history page carries no transcript it cannot change either ([bbc4ade](https://github.com/cgoinglove/thursday/commit/bbc4ade739c950bf2b018196f7cfe01bcef8fc5e))
* **bot:** every list of jobs reads an index, not the whole table ([1097371](https://github.com/cgoinglove/thursday/commit/10973711c0ccc8cee1280b97e2d92248ce7fc680))
* **bot:** the inbox carries no transcript that can no longer change ([7af4cca](https://github.com/cgoinglove/thursday/commit/7af4cca6e20a4ed21c70068b7c5e4eba4c019699))


### Docs

* **seeds:** the workspace finder is copied in each kit on purpose ([0d2db14](https://github.com/cgoinglove/thursday/commit/0d2db1481fa47e6f8c9f5025c18532f074e112f4))

## [0.12.0](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.11.0...thursday-agent-v0.12.0) (2026-09-19)


### Features

* **keys:** a key's box says how it begins and where to get one ([0f056ac](https://github.com/cgoinglove/thursday/commit/0f056ac5fcd61f00543a57d985a4df567e90a032))

## [0.11.0](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.10.0...thursday-agent-v0.11.0) (2026-09-19)


### Features

* **seeds:** every ready-made bot installs by default ([a90a087](https://github.com/cgoinglove/thursday/commit/a90a087f30352d2b9aee4f880e7affacf11c8ae1))
* **seeds:** Mail is no longer offered, and a picture book asks what it should be ([8724434](https://github.com/cgoinglove/thursday/commit/87244342ee50387734351c728b7d895dc24a7926))
* **seeds:** ready-made bots carry scripts, and any page can be a picture book ([f83cde1](https://github.com/cgoinglove/thursday/commit/f83cde1a8ee9d4ac76a8dd2b346fd09200d1c0e2))
* **seeds:** Tutor explains anything as a picture book ([21a1615](https://github.com/cgoinglove/thursday/commit/21a161556bfd7c67d687d0cab283b898702659f7))


### Fixes

* **bot:** the pill folds back to its own width while the write line is up ([9dd662e](https://github.com/cgoinglove/thursday/commit/9dd662e15ec442c1917720b261a831b5222ed7fe))
* **call:** a thread picked back up names its bot, and a line in writing redraws only on change ([7981b9b](https://github.com/cgoinglove/thursday/commit/7981b9b3e47e919fc809f12594b9dfc41305b48d))
* **call:** she speaks the language being spoken, not the browser's ([2135fe6](https://github.com/cgoinglove/thursday/commit/2135fe6c34d0efc8b62d20903cfb7c87fde2625d))
* **call:** the voice reads what the backend can do, as the guide lays it out ([990e17b](https://github.com/cgoinglove/thursday/commit/990e17ba4c0b5ab3b2647daeead796a7989b9d21))
* **call:** the voice's ending rule hands the turn over ([e949d54](https://github.com/cgoinglove/thursday/commit/e949d54a3fde094faac710c1f3b87f32ccc57fb7))
* **call:** the voice's ending rule hands the turn over ([730bc21](https://github.com/cgoinglove/thursday/commit/730bc212908174bfb56f6f7df9a3b790f2a74619))
* **call:** work stays with the answer it led to, and a call in writing reads as typed ([dee5603](https://github.com/cgoinglove/thursday/commit/dee5603994aa3cd1edf909b431d7a40160dd351c))
* **signins:** a kept sign-in takes back the cookies its site renewed ([c749e03](https://github.com/cgoinglove/thursday/commit/c749e032cb845d8a173b6612208c57e5b95fc9b6))


### Under the hood

* **call:** take out the nudge experiment ([bbfcec2](https://github.com/cgoinglove/thursday/commit/bbfcec203267a9229e556c31a33071d2b40c5fec))


### Docs

* **images:** a still of the demo call at 0:33 ([cdd40f1](https://github.com/cgoinglove/thursday/commit/cdd40f172678953eaa3cf438f6a9720e4716aa19))
* **readme:** the demo GIF shows asking a running bot how it's going ([0df9ecb](https://github.com/cgoinglove/thursday/commit/0df9ecbae7c53bf510c4014f0cbc1c040065f502))

## [0.10.0](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.9.0...thursday-agent-v0.10.0) (2026-09-19)


### Features

* **analyst:** add data-report skill with various report forms and scripts ([6f627b2](https://github.com/cgoinglove/thursday/commit/6f627b2e4422676a2d2d43c0a12eb316b1c3d8ce))
* **ui:** what is on or picked is brand blue; buttons stay black ([eda7ca5](https://github.com/cgoinglove/thursday/commit/eda7ca50d89c038fb2799fc9d14f053d747bf5cc))


### Fixes

* **knip:** add seed-skills to ignore list in configuration ([b215038](https://github.com/cgoinglove/thursday/commit/b215038c15f9db1d9139c280f38db92b4a124816))
* **settings:** the theme picker is blue like every other pick ([654f36f](https://github.com/cgoinglove/thursday/commit/654f36f8144bf080021631e58e0e59aa4aba1180))
* **settings:** the theme picker's pick is a raised light pill, not blue ([b5d17b3](https://github.com/cgoinglove/thursday/commit/b5d17b362d4850331cc8cd129fa75a97621e095d))


### Docs

* **guide:** a picked schedule is filled blue ([8d9796f](https://github.com/cgoinglove/thursday/commit/8d9796f185c9edbf59055c38202c03ce1882f96d))
* **readme:** the demo under the hero, and a link to it with sound ([0f4be6c](https://github.com/cgoinglove/thursday/commit/0f4be6c154c6a195e86a5c312e64fb92fad39ab0))

## [0.9.0](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.8.0...thursday-agent-v0.9.0) (2026-09-19)


### Features

* **bots:** a bot is told the app's guide is there ([88d8608](https://github.com/cgoinglove/thursday/commit/88d8608d50f919a2526b5a3b3084fa3bd8a659ac))
* **call:** a line about a thread wears that thread's bot's face ([c70d23d](https://github.com/cgoinglove/thursday/commit/c70d23d3c68dfca805495b1ebdbd69ebce2ef53e))
* **call:** the ringing screen says the wake phrase answers it ([bd89ba2](https://github.com/cgoinglove/thursday/commit/bd89ba2dfbce7153abb0cae7a2c51b15cc945c7a))
* **call:** the tools behind an answer stay with it ([e5cab42](https://github.com/cgoinglove/thursday/commit/e5cab422825fbe1b34a09959513850a509f5e4ac))
* **call:** the wave also plays once as the call screen loads ([1bc1089](https://github.com/cgoinglove/thursday/commit/1bc10892bd4995cfe2d7e439ba8484cd0d95a078))
* **call:** what she is thinking about stands under her face, and a narrow window draws her last line ([d9c5e52](https://github.com/cgoinglove/thursday/commit/d9c5e52318d782774c78534615adab447bc41641))
* **connectors:** everyday presets first — Todoist, Home Assistant, Kiwi, Zapier ([9dea445](https://github.com/cgoinglove/thursday/commit/9dea445f8e4c80eb54d1c65c2cb15436ee672a98))
* **face:** a word on her face arrives and leaves rough, with an afterimage ([b7b7d31](https://github.com/cgoinglove/thursday/commit/b7b7d31b4a4cc9b7c5d33c51c77f4695ab05a0c2))
* **intro:** a lighter first run, and a wave when a call picks up ([4879612](https://github.com/cgoinglove/thursday/commit/4879612949e339105d3dd58d202e196a3d7d7037))
* **notify:** with Thursday open, a finished job's notification brings her forward ([f800244](https://github.com/cgoinglove/thursday/commit/f800244934cfaa2fa279c2311f8861c410b37471))
* **room:** finished work stays in the corner across a reload, and leaves the pill alone ([1040158](https://github.com/cgoinglove/thursday/commit/104015808756e5399250daab5249b12cfdc766cb))
* **routine:** a routine can start once, and When asks one thing a row ([f049599](https://github.com/cgoinglove/thursday/commit/f049599f5dfe6353f27ae0431c843af264d213ca))
* **skills:** a page that reports research shows the pictures it found ([09be863](https://github.com/cgoinglove/thursday/commit/09be8639b5698c35e476273da5acf8a84cd92cc3))
* **skills:** mac-apps for Calendar, Reminders, Notes and Contacts; a skill can name its platforms ([05bce89](https://github.com/cgoinglove/thursday/commit/05bce891f2be8cb3ebd4e32688b27044dbba6fd0))


### Fixes

* **app:** a first run makes its home on 4747, not 3000 ([e1c0d83](https://github.com/cgoinglove/thursday/commit/e1c0d837e08502e7aadb4b3367557b665791e852))
* **bot:** an answer that moves a stopped job on is outlined in brand blue ([6c1eb0a](https://github.com/cgoinglove/thursday/commit/6c1eb0a083b5c1f0683c2beadd1e08ac545d16ac))
* **bot:** the pill says who is moving and what arrived at a glance ([fa1c626](https://github.com/cgoinglove/thursday/commit/fa1c626e06626a7f4cf8aed6ecc863d97b2d1d21))
* **call:** every tool line is a sentence, and a thread's names its bot ([8c9ad59](https://github.com/cgoinglove/thursday/commit/8c9ad59fddd0c9bd1040f957295cf305693f3101))
* **call:** her face's layout box is what she fills, not the field around her ([6042a35](https://github.com/cgoinglove/thursday/commit/6042a3581bfaa3673b40d430f8932e6f025346ca))
* **call:** the captions beside her stand past her canvas again ([2f6da47](https://github.com/cgoinglove/thursday/commit/2f6da4715e67210db438d6e780fb1f891994e712))
* **call:** the connect wave draws with her face's glyphs ([887e76c](https://github.com/cgoinglove/thursday/commit/887e76cb685ba3754e99604c6edba03b1852553f))
* **call:** the connect wave is fewer glyphs at her size, not larger ones ([3d9540b](https://github.com/cgoinglove/thursday/commit/3d9540beca3f448f6a38e706fed5c6c5686ccfa6))
* **call:** the connect wave is sparser specks ([fae059a](https://github.com/cgoinglove/thursday/commit/fae059adfa4fa51b89c16b4234ec5e7626eadbd0))
* **call:** why the last call ended stays up for twelve seconds ([3e212b4](https://github.com/cgoinglove/thursday/commit/3e212b485fffa2c28dfd8cbd37e72ffee4dc8fa9))
* **face:** a word is not said again when it is handed back later ([5b25130](https://github.com/cgoinglove/thursday/commit/5b25130760cdb1296a5a61340f77a85ab59a846a))
* **settings:** the install row is its words and the arrow, without an icon tile ([44f5110](https://github.com/cgoinglove/thursday/commit/44f5110bd888d96f7ed8280783d55c2cb8abe1b2))
* **skills:** what a page recommends comes with photos of it, not screenshots and sources ([0c3cae2](https://github.com/cgoinglove/thursday/commit/0c3cae2e9607b3364a5e0887db19a8ff0182985b))
* **ui:** a picked segment is filled black ([0bd7868](https://github.com/cgoinglove/thursday/commit/0bd786844d2a831dee49f89b1abc7a7254050e59))
* **ui:** what is on or picked is black, and blue is the one ask ([456b9e3](https://github.com/cgoinglove/thursday/commit/456b9e368705721a77c65056343877be55c161b2))
* **ui:** words still running shine on the call screen too ([7ed540e](https://github.com/cgoinglove/thursday/commit/7ed540e31d01d01af8aa895f902435cb9cd1238b))


### Performance

* **call:** the connect wave puts a quarter of the pixels on screen ([6455fde](https://github.com/cgoinglove/thursday/commit/6455fde7358834b4c1fedafd771e25add859b566))


### Docs

* **how-it-works:** writing, the phone, and where sign-ins live ([9a0ac73](https://github.com/cgoinglove/thursday/commit/9a0ac7355032b1515f460c6479d8663d1e1bbb22))
* **readme:** images redrawn from today's screens, on white ([d889754](https://github.com/cgoinglove/thursday/commit/d889754e9ecb7cd4c48bac5abfbbb9b7ae131355))
* **readme:** lead with GPT-Live, the price and the first tap ([3f928ae](https://github.com/cgoinglove/thursday/commit/3f928ae0ccf7d47073911f2b1eae5c9e523c7a0c))
* **rules:** brand blue goes where it matters, not only on the one ask ([e3b20f0](https://github.com/cgoinglove/thursday/commit/e3b20f0ca5555765a06ee8176c38036a43ce42ce))

## [0.8.0](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.7.0...thursday-agent-v0.8.0) (2026-09-19)


### Features

* **app:** installable as its own window, and it comes back on the same port ([31acc5e](https://github.com/cgoinglove/thursday/commit/31acc5e966a0f6cad29d9bf999d390b8235fcd7d))
* **app:** the app offers to install itself as its own window ([6afd592](https://github.com/cgoinglove/thursday/commit/6afd592702cb1df89a9d62057399c5bff21b4e10))
* **bot:** introduce keep working feature and enhance documentation ([38c2362](https://github.com/cgoinglove/thursday/commit/38c236214abd8b4b496dd15eac36fa2546d51136))
* **bot:** show a loading thread while the room reads one no list holds ([7ed2adb](https://github.com/cgoinglove/thursday/commit/7ed2adbc58b42d19bbeeddfeafda7e965d914f3e))
* **call:** a bot can be written to during a call in writing, and nothing is told twice ([e41717b](https://github.com/cgoinglove/thursday/commit/e41717b3f42efc6d25b6785b19ebae1778d7e54c))
* **call:** a call she places rings out loud ([f431505](https://github.com/cgoinglove/thursday/commit/f4315057d7cab116866e57d1b72778cad63d1ce3))
* **call:** a call she places shows more and asks for one thing ([968701a](https://github.com/cgoinglove/thursday/commit/968701a005acd0c1458b760b308cb2c71394c4df))
* **call:** a call she places takes the screen under her face, not a corner card ([b991c85](https://github.com/cgoinglove/thursday/commit/b991c85b9bfaa68c18735a174e8d75072f41c767))
* **call:** a file put down during a call is a fact the call is given ([008f852](https://github.com/cgoinglove/thursday/commit/008f852c29b0e68efb20c6dfb069529e4665e3a8))
* **call:** a job that waits on the user rings by default ([62686a5](https://github.com/cgoinglove/thursday/commit/62686a5e157410ed3bdaf147a44a4eb72ee7c22a))
* **call:** a quiet call ends itself after 20 seconds, not 30 ([6a93a05](https://github.com/cgoinglove/thursday/commit/6a93a05b47020ef3e8c35477d149acc3e08cb3ca))
* **call:** an experiment, off — the page starts a backend turn the voice kept ([832369c](https://github.com/cgoinglove/thursday/commit/832369c2eb61fa36aae1ee3673d15b19522ede30))
* **call:** an open thread lies over the call and moves none of it ([fe6e4c6](https://github.com/cgoinglove/thursday/commit/fe6e4c61669875854cdc2799ca5c1d6b14dace28))
* **call:** asking to see a result opens the file it made ([96c32a1](https://github.com/cgoinglove/thursday/commit/96c32a14739e1d63ef0ae491febaa07ccf509af0))
* **call:** each line under her face stays long enough to read ([ef7cec7](https://github.com/cgoinglove/thursday/commit/ef7cec7bdfe18dfcd61f02d9e9ee2ea8ca59e2f1))
* **call:** her face rests while the user talks ([fdcb7c7](https://github.com/cgoinglove/thursday/commit/fdcb7c72b37fbbc9dcad6b985c2a2241c892303f))
* **call:** she opens a call as someone who remembers the last one ([ee897c1](https://github.com/cgoinglove/thursday/commit/ee897c1fbe7e1f62804af7b9d9e63350a528b092))
* **call:** with captions down the sides, what she is doing stands on her side ([443888d](https://github.com/cgoinglove/thursday/commit/443888d8f9e14378641d120866ae8d1f83ced566))
* **call:** work handed over comes back in writing too ([5cbbb8e](https://github.com/cgoinglove/thursday/commit/5cbbb8e942f6256eb695a71fb1f7746b58f87977))
* **call:** writing to Thursday is a call in writing ([2e45955](https://github.com/cgoinglove/thursday/commit/2e45955898c580e2cdce6c679f008aaadf32f8a8))
* **config:** the call's key is checked with OpenAI as it is saved ([3faa18f](https://github.com/cgoinglove/thursday/commit/3faa18f5d736ba885e88803b93a76a7aa3b89477))
* **connectors:** vendor icons come from this server, not a third party ([9aaabc9](https://github.com/cgoinglove/thursday/commit/9aaabc9fb497fd77b0002c27c635fc6f6edc2722))
* **corner:** every finished job is the same card, and opening one reads it ([1f82af7](https://github.com/cgoinglove/thursday/commit/1f82af743a8ae9ae5ea5b10bbd8198773e1f9628))
* **face:** her small face is the orb in miniature, from one component ([458e59c](https://github.com/cgoinglove/thursday/commit/458e59c283d981b3a06621cd2a7c06ff3bb61e84))
* **face:** one ascii wave as the app opens and as the intro ends ([0adfffb](https://github.com/cgoinglove/thursday/commit/0adfffb157a371191c1735983a0cf1050bf3a268))
* **face:** she says hello, goodbye and OK on her face ([7ad9621](https://github.com/cgoinglove/thursday/commit/7ad96213341bf6ba1fd4672dcb645c9927711510))
* **face:** while she works only the comet is left ([c65d621](https://github.com/cgoinglove/thursday/commit/c65d6213d5d737ae1fba3ed13c1c9d527f4f0c5b))
* **files:** a page or a report shows itself before it is opened ([aeba1f0](https://github.com/cgoinglove/thursday/commit/aeba1f08810c46b95f9ff7a2ef01e0ba6947d0d1))
* **guide:** read the guide whenever an answer depends on the app ([02f890e](https://github.com/cgoinglove/thursday/commit/02f890e951fdfa4c486cda65c2446553717f9454))
* **intro:** plainer first screen, and nothing moves between steps ([2260492](https://github.com/cgoinglove/thursday/commit/226049296acdc80bb5213f7783b892d98cb728e0))
* **intro:** she is heard on the first run, in a recorded voice ([3b8f585](https://github.com/cgoinglove/thursday/commit/3b8f585b6c8addca6f31bd415a2e4baa7979c85a))
* **intro:** the first run is the call screen, and ends on the first call ([8e08e5e](https://github.com/cgoinglove/thursday/commit/8e08e5ef87bbaca9df92bad68f6ec86853ac4164))
* **intro:** the model step shows one row of providers, and More ([ec4c948](https://github.com/cgoinglove/thursday/commit/ec4c948f56d6e03775b4ed9a9ac221fdee1855a9))
* **intro:** trying the wake phrase is the thing that moves ([9aa0127](https://github.com/cgoinglove/thursday/commit/9aa01275e4096ca5e8022f8c093488785f946dae))
* **intro:** what is set arrives one by one before the first call ([039d71b](https://github.com/cgoinglove/thursday/commit/039d71b8f058203eb80c643077e18935f7305eda))
* **look:** a model sees a picture — a bot's screenshot, an image handed over in writing ([e9003c3](https://github.com/cgoinglove/thursday/commit/e9003c3c18d182511a156926c4c2c639ee9010ed))
* **models:** a bot can go back to the app default, and the intro sets that default ([0111e7c](https://github.com/cgoinglove/thursday/commit/0111e7c09c4db00a11093a651ad4978a06992419))
* **models:** a provider and its model behind one button ([21d5427](https://github.com/cgoinglove/thursday/commit/21d5427ccd63a68fc16a88b191a0798fee37e459))
* **models:** bots run on eight more providers ([595fbfb](https://github.com/cgoinglove/thursday/commit/595fbfb57cbadc8cd55ff796441469a0cf74c62e))
* **models:** provider marks in their own colours ([085da89](https://github.com/cgoinglove/thursday/commit/085da890fb175ec5bea2c84df14658ce5e6078e7))
* **reach:** Discord and Slack beside Telegram, each one file behind one seam ([b52312b](https://github.com/cgoinglove/thursday/commit/b52312b0dc7f0a1595c91b5e1970ab94ac3b4111))
* **reach:** write to Thursday from a phone, through a Telegram bot the server asks ([11934af](https://github.com/cgoinglove/thursday/commit/11934af4258d2474d561748c421365eb118994fd))
* **reset:** the reset script offers the kept sign-ins too ([1f54d57](https://github.com/cgoinglove/thursday/commit/1f54d574c2dc91ebe13659f19aee8f604e1f64fa))
* **room:** a bot's steps say what they did, and a finished run folds to a strip ([4a98160](https://github.com/cgoinglove/thursday/commit/4a98160b2681e4d6948b9dcc1b293d404be70d60))
* **room:** a thread's reply takes files too ([8c08ce3](https://github.com/cgoinglove/thursday/commit/8c08ce3de677ca08ccde62c104833ffc48640e42))
* **room:** folded work says what was done, how much and how long ([01857ff](https://github.com/cgoinglove/thursday/commit/01857ff959b19e5eb26cdaadce9284c3bdb1a7e3))
* **room:** pressing a thread's context bar has its bot summarize at the next step ([60332ac](https://github.com/cgoinglove/thursday/commit/60332ac0ac75e052c964573edfa30a95024a7d85))
* **room:** the bot on screen folds nothing, a search shows every page it read ([d818037](https://github.com/cgoinglove/thursday/commit/d818037b902b73a4bf361e05112b7f0a5d8af1de))
* **room:** the open room is larger, and the call steps aside for it ([eb0bc8f](https://github.com/cgoinglove/thursday/commit/eb0bc8f04f84e9da905b47e402c83ab9ef930b46))
* **room:** words stepped in with wait registered, and say so once read ([9d0df6b](https://github.com/cgoinglove/thursday/commit/9d0df6bd5318d4c0f76f73d510fae6d5126438cf))
* **routines:** implement routine management and enhance bot functionality ([fb6827c](https://github.com/cgoinglove/thursday/commit/fb6827c307f5aaf587f9a0fc2124405e41fa76f0))
* **routines:** the routine sheet says what each field is and what was picked ([869832a](https://github.com/cgoinglove/thursday/commit/869832acfa5ab6e322a4c9617d2f77a128d1ef4b))
* **settings:** a row for each subject again, and finished work as a shelf ([780ea9f](https://github.com/cgoinglove/thursday/commit/780ea9f3718594913b67bcaea13e412342dada48))
* **settings:** eight sections, and keys with the models they open ([6e16b23](https://github.com/cgoinglove/thursday/commit/6e16b235c6b24e0ef6c6e9cafd6828030c24f24b))
* **settings:** the phone screen walks through the setup; files list bots; a routine is added from its list ([95cc9cf](https://github.com/cgoinglove/thursday/commit/95cc9cf8ed845576acc0072ed56552bf65f39c87))
* **signins:** the app keeps a site's sign-in, and the user says which bots borrow it ([b27f3fe](https://github.com/cgoinglove/thursday/commit/b27f3fe6444ed2b7e146504a2885afcd6a4d76ae))
* **skills:** a bot installs and writes skills for itself by default ([673b322](https://github.com/cgoinglove/thursday/commit/673b3228a52c1ca10c16f2717ef716e403ae23de))
* **skills:** a quick page — one hand-written HTML file, no kit and no build ([720cc28](https://github.com/cgoinglove/thursday/commit/720cc287ef40360ce20a59c2e37bfee73f36ae9b))
* **skills:** build every interactive page on one pinned kit ([351ec3c](https://github.com/cgoinglove/thursday/commit/351ec3cce161c8744621a32ca58c6447cbf458d5))
* **skills:** draw diagrams with archify, not mermaid ([4c36c94](https://github.com/cgoinglove/thursday/commit/4c36c94dc438685dcfdedab3897e1b3c659d4df1))
* **skills:** eli5 ships with the app ([7a1d1d2](https://github.com/cgoinglove/thursday/commit/7a1d1d28a5f76ae5b2897bac25bc7fd2a513f716))
* **text-call:** the model for writing to her is picked on the line, and a broken turn can be sent again ([69fcf43](https://github.com/cgoinglove/thursday/commit/69fcf43b2d6f0177f2515470f01b26bab53165c3))
* **ui:** enhance text display with animated letter transitions ([7972cdf](https://github.com/cgoinglove/thursday/commit/7972cdfbe3d82734dddea2119cfdda265d05f834))
* **ui:** one brand colour, blue, as a point ([18739b4](https://github.com/cgoinglove/thursday/commit/18739b4da5b44a6bd5d3e1c439b2cbba0b2a278c))
* **ui:** what is switched on or picked is the brand point, everywhere ([d3d8631](https://github.com/cgoinglove/thursday/commit/d3d8631e32ffbd8fcbed6f3aa1054671ed261586))
* **write:** one line at the foot of the screen for words and files ([c5723a1](https://github.com/cgoinglove/thursday/commit/c5723a1bd1002d566589b56cf904fde5c28d7a76))


### Fixes

* **app:** a port asked for by name becomes the app's address ([0794b99](https://github.com/cgoinglove/thursday/commit/0794b9973d32ded72f5b2108e6ed0485481e43ef))
* **bot:** drop the Analyst seed's line that every installed skill is shared ([f5edf81](https://github.com/cgoinglove/thursday/commit/f5edf812731deb6606f90d65b402d512fb222dba))
* **browser:** bots drive the browser the app downloads, not the user's Chrome ([13ae197](https://github.com/cgoinglove/thursday/commit/13ae1974a96c1be79a1d12776cee6e287fd03b4e))
* **call:** hang up on the user's own words, and put updates in after the answer ([3b17194](https://github.com/cgoinglove/thursday/commit/3b17194e4a687d0912c6cd40f941108450d78418))
* **call:** her answer to what they just said is a caption turn of its own ([86c758e](https://github.com/cgoinglove/thursday/commit/86c758e33f64e730257cf10e3a383d8a2472e76b))
* **call:** she is not drawn asleep for the first moment of a load, and her hello comes with her ([a599d7b](https://github.com/cgoinglove/thursday/commit/a599d7baab9197db4e07874716fd517ecaaa7b58))
* **call:** the ringing words sit close under her face ([1f4ae4e](https://github.com/cgoinglove/thursday/commit/1f4ae4e829f3cf38b2cacd501b0aa4a828fc6cff))
* **call:** the route that runs a tool builds the set the call opened with ([6505aa3](https://github.com/cgoinglove/thursday/commit/6505aa3e4da1a80b99ca756e4f2d8849deaee957))
* **call:** the thinking line no longer counts seconds ([8d8c0f2](https://github.com/cgoinglove/thursday/commit/8d8c0f2fa8f95078017d5642d278803b4438dfc1))
* **face:** a word is drawn as wide as ERROR is, and her face keeps still for soft sounds ([1d61b3d](https://github.com/cgoinglove/thursday/commit/1d61b3d08566f00f1b10d25c6b56759e3e9ed687))
* **files:** a numbered run said as its two ends is every file in it ([c61f7f9](https://github.com/cgoinglove/thursday/commit/c61f7f9eded7eb96e435316bd4a2c52c9fbaebd9))
* **intro:** the last step's foot is not a stack of four rows against the pager ([a8bb802](https://github.com/cgoinglove/thursday/commit/a8bb8025c07d0738ea25c35d63411ee676cd2bac))
* **keys:** More opens the rest of the providers over the row ([e3d81af](https://github.com/cgoinglove/thursday/commit/e3d81afa7f5b910ca87a3bd044488fa6593921d3))
* **markdown:** no block inside a paragraph, no button inside a file's tile ([519768e](https://github.com/cgoinglove/thursday/commit/519768e51390e48f3cfa12a72d2c7ae6ec45fcff))
* **mark:** her smallest mark is round, and the mid sizes are full ([afc71ba](https://github.com/cgoinglove/thursday/commit/afc71bace9b9cc7017653278cb1d88fc21923400))
* **prompts:** the backend is not told which words to avoid with the user ([c41c654](https://github.com/cgoinglove/thursday/commit/c41c6548f392d50e0a9a6891d2b20942ad2a83d2))
* **room:** a step that browsed reads as browsing wherever the command names the browser ([5e08f93](https://github.com/cgoinglove/thursday/commit/5e08f9349479974e062d969a6e6257247eac99d3))
* **room:** a thread's header shows the last step's tokens ([d8696a2](https://github.com/cgoinglove/thursday/commit/d8696a29d0d736e41cf26e06fef96d4453f38260))
* **room:** History loads in the shape of one day and one row ([9ad9f5e](https://github.com/cgoinglove/thursday/commit/9ad9f5e1f911b0284398842747475055b32642f2))
* **room:** the call steps aside for an open thread only ([0efa3ee](https://github.com/cgoinglove/thursday/commit/0efa3ee49147f21588c1a3de3ccb70a0ec699ae9))
* **seeds:** a ready-made bot borrows a sign-in from the app, and names the Models screen ([005d1d6](https://github.com/cgoinglove/thursday/commit/005d1d6e677d64caa9c41718081c02600f0d9859))
* **seeds:** Analyst sizes its answer to the ask ([06a7c82](https://github.com/cgoinglove/thursday/commit/06a7c82341b08f5dbb17a256b1786af53be18e40))
* **seed:** the Analyst answers a quick question in words, not a page ([a4b44d2](https://github.com/cgoinglove/thursday/commit/a4b44d25c5390094f34d5e391185df4bb24acaa9))
* **settings:** the install row at the foot of settings is one of the nav's rows ([78c1959](https://github.com/cgoinglove/thursday/commit/78c19594a9da667741535e668247b0159c50bcd1))
* **settings:** the install row reads as an action — brand ink and an arrow ([89eff8b](https://github.com/cgoinglove/thursday/commit/89eff8b82e7a18b0fc9e8a4d43b51dbefe527deb))
* **settings:** the install row says what it does on a second line ([b59003e](https://github.com/cgoinglove/thursday/commit/b59003ee85b8c79195148ef9dd3f88085d6323e7))
* **signins:** the vault is a dot folder that git ignores ([cd8c5b8](https://github.com/cgoinglove/thursday/commit/cd8c5b88075033bc9f1549cdd2463b3b97775077))
* **skills:** ask the user through a question, not a tool that is gone ([d8a4b64](https://github.com/cgoinglove/thursday/commit/d8a4b647183dfdb65c3e60951fead9396152d76b))
* **text-call:** a turn that breaks can be left, and her face says so ([5927720](https://github.com/cgoinglove/thursday/commit/5927720c47d00a77b2762c3c484180aa558817c2))
* **workspace:** a thread takes its browser profiles with it ([0aeda54](https://github.com/cgoinglove/thursday/commit/0aeda549a2f116af306640604317b161e12deab1))


### Under the hood

* **bot:** the room's screen is split by subject ([8bf37e1](https://github.com/cgoinglove/thursday/commit/8bf37e1f713123130980be402088a228e8aed3f5))
* **call:** the call-back ring is its own hook ([5f79221](https://github.com/cgoinglove/thursday/commit/5f79221ef3fe9cb83bbea550eff8c63268b36391))
* **call:** the call's thread tools are a family, one tool for each thing it does ([3cbdce1](https://github.com/cgoinglove/thursday/commit/3cbdce1e85a7ff2364a94c7975d9d2f06f9a91f2))
* **face:** her face is the ascii orb alone ([3791d6c](https://github.com/cgoinglove/thursday/commit/3791d6c8b752b421801cd83581b4ffa85dd8779f))
* **guide:** keep the guide feature in one file ([c8f585f](https://github.com/cgoinglove/thursday/commit/c8f585f2d8ee6aa64bc832b57dae13c4f5067780))
* **live:** the backend's hosted tools are one table ([e22c41d](https://github.com/cgoinglove/thursday/commit/e22c41d3fe2d93adfd54f4ebdf657dc52b506c92))
* **model-picker:** improve layout of model label and icon for better visibility and truncation handling ([055c9ac](https://github.com/cgoinglove/thursday/commit/055c9acb76400b22470816b06f1949cc53b508bb))
* **search:** one deadline and one failure path for both runtimes ([cce1b89](https://github.com/cgoinglove/thursday/commit/cce1b89edde33dde9db6871976695cc4ca420d0e))
* **text-call:** one run for whoever holds the conversation ([beba0ee](https://github.com/cgoinglove/thursday/commit/beba0ee67828996e4f9d6573c37b83d7fe4d91d3))
* **tools:** drop the spec name fields nothing reads ([40766b5](https://github.com/cgoinglove/thursday/commit/40766b5caaf17d6522bf35196d1ea5d2703eaeae))
* **ui:** one site icon and one row of source chips for every screen ([e36c973](https://github.com/cgoinglove/thursday/commit/e36c9734dd2fc72f0d16c99e9d6ba9658fd149be))


### Docs

* **agents:** move the rules for one area next to the code they govern ([b840ce8](https://github.com/cgoinglove/thursday/commit/b840ce8c3e6693e778c60e7fdec99b796d149161))
* **guide:** what her face says by itself ([6cd2366](https://github.com/cgoinglove/thursday/commit/6cd2366404dd32e1e0648d8f4ec2a3375b50688c))

## [0.7.0](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.6.0...thursday-agent-v0.7.0) (2026-09-17)


### Features

* **call:** implement call-back feature and enhance documentation ([1aa6903](https://github.com/cgoinglove/thursday/commit/1aa6903a2ddcdd10a2ed42f1b1961afe00865f9f))
* **face:** introduce emote feature for displaying words on the face ([db40358](https://github.com/cgoinglove/thursday/commit/db40358e53477b5943b8855758b48f20b26e7f5b))
* **prompts:** refine live and backend prompts for clarity and functionality ([2ef3a0d](https://github.com/cgoinglove/thursday/commit/2ef3a0d50f25a23bc09b4a70e301343b1f9ba1bb))


### Docs

* **readme:** show the call with side captions ([a979fdd](https://github.com/cgoinglove/thursday/commit/a979fdde6b83602b5d5bb9c60cd60f0707156d63))

## [0.6.0](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.5.0...thursday-agent-v0.6.0) (2026-09-16)


### Features

* **call:** both call prompts open with the same rule for ending the call ([aec5932](https://github.com/cgoinglove/thursday/commit/aec5932cb578b81b8021ebb0647ca979a0d1c112))
* **call:** the voice acknowledges now and then while the user speaks at length ([8b0a5f4](https://github.com/cgoinglove/thursday/commit/8b0a5f46a3a6ec64a96403de06c2e7f3ba84fa6f))
* enhance artifact management and workspace organization ([88f9a5b](https://github.com/cgoinglove/thursday/commit/88f9a5bcb20a3686a7c393c35a70d2282e914f0b))
* enhance call management and introduce new popover component ([7948f09](https://github.com/cgoinglove/thursday/commit/7948f09d5997935bc06fb8938d29af9a34f689c3))
* enhance task management and messaging in Thursday agent ([d498ba4](https://github.com/cgoinglove/thursday/commit/d498ba4dd6afc9fda40eca23003eddecca5a7250))
* give each seed bot a role it can work by alone ([10b4321](https://github.com/cgoinglove/thursday/commit/10b432146044fd85205c11ca4ae5173efa59640a))
* introduce call reasoning summaries and enhance bot interactions ([bc12b8a](https://github.com/cgoinglove/thursday/commit/bc12b8aefed5bc9cecd1aaf74920447d6202bd6e))
* let the call's transcript be switched off, and what reads it back with it ([65096de](https://github.com/cgoinglove/thursday/commit/65096de2a50f596562b0c409e2164ff9e18a30f4))
* update bot roles and improve documentation ([807b232](https://github.com/cgoinglove/thursday/commit/807b2320dd7253a8bd30a4df1ec4695c37471779))
* update thread management and enhance documentation ([554cd12](https://github.com/cgoinglove/thursday/commit/554cd1283924543f86cbe87a6dba8d9f3fe01c0c))
* write profile and preferences out in the call prompt, and talk in the user's language ([fa47fa5](https://github.com/cgoinglove/thursday/commit/fa47fa582663aa236678c514f990215ec710ecfb))


### Fixes

* **call:** a call-back says it placed the call and puts its reason in at once ([2743418](https://github.com/cgoinglove/thursday/commit/2743418e560968e8068a3bc4d34bf18438d7244e))
* **call:** owe an answer only for words she has not voiced after, and bound cut-off continuations ([422d0ae](https://github.com/cgoinglove/thursday/commit/422d0ae8d313e1fc6f7c4079425c00f9982f5bc5))
* refuse a memory path outside the convention instead of filing it in inbox ([9903fdb](https://github.com/cgoinglove/thursday/commit/9903fdbfc840ad9ac1c37aae8056da23160dc4a2))
* tie no fact to a call while its transcript is off ([d0e73fe](https://github.com/cgoinglove/thursday/commit/d0e73fe602263cdcda1ac37422525d6d00a0da91))


### Under the hood

* enhance message rendering in bot room component ([b06066d](https://github.com/cgoinglove/thursday/commit/b06066dfef0ff037cd99b7ec7a38958efe5df605))
* **faces:** remove the orb's unreachable emotion system and the mark's unused knobs; the waiting dot is amber ([69f103e](https://github.com/cgoinglove/thursday/commit/69f103e7051e9347cc5ea9d92e6b80c540e16cff))


### Docs

* rewrite the README as a pitch, and keep the room where bots talk to each other ([3d1ae82](https://github.com/cgoinglove/thursday/commit/3d1ae8268b9e3ddd9b7eec1a42eaca3aa338f8c4))

## [0.5.0](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.4.0...thursday-agent-v0.5.0) (2026-09-11)


### Features

* introduce AGENTS.md for Thursday voice agent documentation and update various files ([3dbb6fb](https://github.com/cgoinglove/thursday/commit/3dbb6fbcbcfc753f744e9398d193ab929f1ec0ec))

## [0.4.0](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.3.0...thursday-agent-v0.4.0) (2026-09-11)


### Features

* say who is who in every prompt, and who said what to a job ([d1a3ef8](https://github.com/cgoinglove/thursday/commit/d1a3ef8becf97c91cf81a33c20b345858d0c7c90))


### Fixes

* draw an app stop in the bot room as a stop, not a compaction ([4d7a9e4](https://github.com/cgoinglove/thursday/commit/4d7a9e4d3b714c7f460d5ad210153a8610d4d6ad))
* keep the dev server on this machine, as the CLI already does ([99e89df](https://github.com/cgoinglove/thursday/commit/99e89dfdbb001d5da45be229d834cfd3bef4f050))
* listen for the ChatGPT sign-in on both loopbacks ([bed977c](https://github.com/cgoinglove/thursday/commit/bed977c093795038e5d965fc6bb7fddba33e1d7f))
* say why an old database can't boot, instead of a raw SQLITE_ERROR ([7b31b15](https://github.com/cgoinglove/thursday/commit/7b31b151a66b9ef8cdf06371ca78e1ba2dab59d5))
* start on a port nothing holds on any address, in dev as well as the CLI ([1248102](https://github.com/cgoinglove/thursday/commit/12481029def17add255d6d6584d10874ecfe7c6b))


### Docs

* lead with the emoji face, and say what bots do now ([13347ad](https://github.com/cgoinglove/thursday/commit/13347adb7a51ed63e54ed9e25375c0c02ad1d1e7))
* redraw the three README artboards for the emoji face ([57eba59](https://github.com/cgoinglove/thursday/commit/57eba59873d0c0bb51810bbd4baa1ae307340328))

## [0.3.0](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.2.0...thursday-agent-v0.3.0) (2026-09-11)


### Features

* a bot can be switched off ([e4175f4](https://github.com/cgoinglove/thursday/commit/e4175f40f32fdaa16a12178352798bf5532eeb0d))
* a bot can leave a browser open to show you, and only the hidden one closes ([368f5b5](https://github.com/cgoinglove/thursday/commit/368f5b514c449a53bfd5ac906d7bdd61cb7c7dd6))
* a centred bot face, a tab that shows what waits on you, and shine that reads on light ([108ff2d](https://github.com/cgoinglove/thursday/commit/108ff2dc3cb04903eb6d40490d5a1aa47473ef40))
* a fact opens the conversation it was said in, and nothing reads calls back ([e876132](https://github.com/cgoinglove/thursday/commit/e87613283537973fb6affcdff8c1c440db69211d))
* bot runs pick themselves back up after a restart, a closed browser or a model that goes quiet ([0875907](https://github.com/cgoinglove/thursday/commit/0875907e5d025e693bcb6576e57d6b0ba521e19a))
* bots keep their own memory as files, not one rewritten note ([7adba40](https://github.com/cgoinglove/thursday/commit/7adba4037992b176305b2b51cc6a5d938ae13d59))
* bots read the user's memory and no longer write to it ([b4cfc4d](https://github.com/cgoinglove/thursday/commit/b4cfc4de9292c64b77e90d217da1ea8af3289462))
* clear what jobs leave behind after three days ([4c47663](https://github.com/cgoinglove/thursday/commit/4c47663e6c4a6f5aca8078d11ed7dd4eb9a5cdb8))
* edit memory from its own screen, one change at a time ([c8d9fb9](https://github.com/cgoinglove/thursday/commit/c8d9fb990313b8c46a18123f5c5f2926056984d0))
* enhance documentation and configuration for thursday skill ([7382b4f](https://github.com/cgoinglove/thursday/commit/7382b4f3d86cf5b0d6f4272adc52c00d148a0b91))
* implement ChatGPT sign-in functionality and related configurations ([d8afa1d](https://github.com/cgoinglove/thursday/commit/d8afa1d8549cf3838e6dc5d0c6effc782cefab5c))
* offer ready-made bots from the New bot line, with what each still needs ([cf91f7a](https://github.com/cgoinglove/thursday/commit/cf91f7ae325f677599e77e0c85bbce1d510867b1))
* say on the Models section when no studio model is picked ([a5e7a52](https://github.com/cgoinglove/thursday/commit/a5e7a529a31436d13e3b16a6daa206e2d2b54b39))
* see what a bot keeps on its page, open a file in place, delete one ([f0c60d3](https://github.com/cgoinglove/thursday/commit/f0c60d3179f9876c57469d83699be56b30747558))
* seed Insta and Voyage, and offer only the recommended three at install ([10ccb34](https://github.com/cgoinglove/thursday/commit/10ccb342478c740a07defde4ee6168bb2ebe90a9))
* stream memory edits from the memory tab, reading notes on demand ([5290d13](https://github.com/cgoinglove/thursday/commit/5290d13d0c101618ab731756bdc473ae09b98521))
* update ASCII_FACE charset to support emoji only ([71829c4](https://github.com/cgoinglove/thursday/commit/71829c424d5e580ad071c919cb600dc4c918a2a9))


### Fixes

* a bot borrowed onto a job works in the job's folder ([9b358a2](https://github.com/cgoinglove/thursday/commit/9b358a29e006ff1b54620a2739a1859f924bff93))
* let a seed bot's prompt be saved past the old cap ([ddc2296](https://github.com/cgoinglove/thursday/commit/ddc22965e61a630d35f38a351add5763f8b251ee))
* point the model shelves at ids the providers still answer ([30a5705](https://github.com/cgoinglove/thursday/commit/30a570590c3b34edfe71d79b73cd12798f28913f))
* stop telling a bot its step count, and raise the cap to 30 ([e0d0eba](https://github.com/cgoinglove/thursday/commit/e0d0eba08bf6f0e364e684891f9db7ea0ed21ede))


### Docs

* say what memory actually is, and where reads are not fenced ([1855214](https://github.com/cgoinglove/thursday/commit/18552148baea3b9245ef918d8e13de16a77b0cb4))

## [0.2.0](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.1.2...thursday-agent-v0.2.0) (2026-09-09)


### Features

* a broken run says so, and the shell says what this machine has ([b3515e3](https://github.com/cgoinglove/thursday/commit/b3515e317870a698ff707f657ec7cb9f6b7ddd01))
* a folder for the job, a folder for the bot, and shorter notes ([1ba4769](https://github.com/cgoinglove/thursday/commit/1ba4769b2864ae3432b0d8934bc80838923797d4))
* a prompt and its tool set say what they cost ([f58d96a](https://github.com/cgoinglove/thursday/commit/f58d96aba2a6dd2de9f248537b59a9073fde27b2))
* bots keep their own notes, and learn the machine on their first command ([c06996b](https://github.com/cgoinglove/thursday/commit/c06996b7068230f12f8cfd75de5ff0131b67fab7))
* every fact in memory records whose hand wrote it ([72e3f5f](https://github.com/cgoinglove/thursday/commit/72e3f5f2ae39dcff05022e430d72ff9b60688dff))
* introduce PROMPT_CROWDED configuration and update bot/skill settings ([6dfea3a](https://github.com/cgoinglove/thursday/commit/6dfea3a201c579bd353373b8b1ccd9bf29ef45a5))
* one folder per job, and a tool argument may be left out ([d92bff1](https://github.com/cgoinglove/thursday/commit/d92bff1af511544339dc620a423eabe1045dc3b1))
* the crew says who, the words say what ([e276663](https://github.com/cgoinglove/thursday/commit/e276663d886ae74e82ead9e3ffb8776179d18512))


### Fixes

* keep memory's bookkeeping off the model, and say what time it is ([5a11299](https://github.com/cgoinglove/thursday/commit/5a1129924b2ddf928f972d7646f128875089231e))
* writes that must land, and turns that must be stored whole ([a13b3d0](https://github.com/cgoinglove/thursday/commit/a13b3d0c18842a1d657cf8af4e8113f0b73eb24d))

## [0.1.2](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.1.1...thursday-agent-v0.1.2) (2026-09-08)


### Fixes

* start on a free port instead of an EADDRINUSE stack trace ([336dede](https://github.com/cgoinglove/thursday/commit/336dede509dd717725d66c77733c548451770422))

## [0.1.1](https://github.com/cgoinglove/thursday/compare/thursday-agent-v0.1.0...thursday-agent-v0.1.1) (2026-09-08)


### Fixes

* let npm choose the native binaries, instead of shipping the build machine's ([a9903cf](https://github.com/cgoinglove/thursday/commit/a9903cfefa66c504efc1f80c7991757b1b2734ca))
* publish from the version release-please decided, not from its tag ([ca4b75a](https://github.com/cgoinglove/thursday/commit/ca4b75a96a604e4b64fcdf388797b26286c8a0ff))

## 0.1.0 (2026-09-08)


### Features

* first public release ([2779293](https://github.com/cgoinglove/thursday/commit/27792938e57522cfe6f3c7e60b7797980cb98738))


### Docs

* say what a harness is, and what the call can do that none of them can ([5ff27a2](https://github.com/cgoinglove/thursday/commit/5ff27a2ce1f582370b6a3fda9be11ca12266662f))
