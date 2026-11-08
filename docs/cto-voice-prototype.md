# Studio CTO voice prototype

Live voice is available to all signed-in hosted Studio users, not the OSS
runner. OSS users do not need microphone permissions, speech credentials or
Google Workspace to run evaluations.

Studio CTO Chat combines text with opt-in live two-way voice and a guided sample of adaptive
test setup. The sample does not execute evaluations, control accounts or establish
evaluation results. Continue using the OSS evaluation documentation for actual
configuration and runs. Setup-call booking and Google Meet are not implemented.

Hosted Studio includes Humanly-only screen help within the CTO conversation.
The CTO can offer a relevant walkthrough or ask for continuous Humanly sharing; users
can accept, decline or choose Share screen beside the message box. There is no
separate tabbed guide. Walkthroughs point to real controls and remain user-driven.
First use asks combined screen-and-microphone consent before automatic frame
updates. Starting or resuming sharing also starts voice if disconnected, with
browser microphone permission; an existing voice session is reused. Opening the
screen icon alone never activates the microphone. Voice connection failures
require explicit retry rather than silently sharing without voice. Pause keeps
voice connected, but Stop sharing also ends live voice. The active speaker icon
switches voice off. Sensitive pages and hidden tabs pause sharing.
There is no repeated Capture/Review/Send loop. Model suggestions cannot start
sharing. Updated Humanly views support read-only troubleshooting alongside
voice. This is sampled page sharing rather than full-rate desktop video,
external screen observation or autonomous account control. Form values are masked,
and default captures hide unapproved text including errors and results. Users
can opt into visible page text for diagnosis, but sensitive visible content may
remain. Selected images are analysed by OpenAI; Humanly retains only the latest
fresh frame temporarily in process memory. Provider retention
policies still apply. The guide cannot save changes or start paid runs for users.

Screen analysis distinguishes visible evidence from possible causes and suggested
checks. It cannot inspect hidden runtime logs or establish an evaluation pass.
Voice can inspect supplied frames; it does not independently see every video frame.
This feature is not part of the OSS runner and introduces no OSS dependencies.
