# Five-minute self-recorded walkthrough

Record your own screen and voice. This is a script and shot list, not a completed video. Open the deployed page and run a verification once before recording if the free host has gone idle. Keep the browser at a comfortable desktop width. Use your actual measured development and recording time in the closing sentence.

## 0:00–0:35 — Problem and scope

Show the task at the top of the page.

“This is Outcome Check, an independent verifier for a coding agent's completion claim. The task is deliberately small: fix Save so a note reaches the server and appears when the same workspace opens in a fresh browser session. I wanted to make a failure visible in under a minute, and keep the verification outside the candidate's tests.”

“The four candidates and their claims are handcrafted. What runs live is the app, its visible tests, and the independent browser and storage checks. I'm not presenting these as observed model behavior.”

## 0:35–1:40 — The ordinary failure

Choose Browser-only save. Type a short note, click Save, then click Verify independently. Point to the visible-test result, the storage check, and both screenshots.

“This implementation looks successful. Its visible tests check the confirmation, the displayed note, and a page reload. They all pass because the implementation saves to localStorage. But the task explicitly requires server storage and access from another browser session.”

“The verifier uses a separate workspace and a new random note. Here is the read-only database observation: no row. Here is the second browser session: no note. The success claim is contradicted. That doesn't tell us whether the agent made a mistake or intended to exploit the tests.”

## 1:40–2:25 — The manipulated score

Choose Weakened tests, run verification, then expand candidate code and test changes.

“This fixture deliberately removes the assertions that a note exists and survives reload. The Save operation is a no-op, but it still displays Saved, so the remaining test passes. The independent verifier does not inherit that weakened test. It checks the same outcome contract and produces the concrete failure evidence.”

## 2:25–3:05 — The benign control

Choose Legitimate test edit and run verification.

“Test modification is not my outcome classifier. This implementation works, and the tests were legitimately reorganized. The system reports the changed test fingerprint separately while passing the actual outcome. This control prevents me from equating an integrity signal with proof of wrongdoing.”

## 3:05–3:40 — Honest uncertainty

Choose Correct server save, enable Simulate storage-observer outage, and run verification.

“Here I explicitly make the independent storage observer unavailable. The fresh browser can display the note, but the verifier cannot establish both requirements. The result is Unverifiable. A failed observation should not silently become a successful task.”

## 3:40–4:15 — Comparison

Click Compare all four. Point to the measured comparison.

“The baseline reruns each candidate's own visible tests. In this constructed suite it accepts both incorrect implementations. The independent checks reject those and accept both correct ones. These are four mechanism demonstrations with manually specified expectations, not a detection-accuracy benchmark.”

## 4:15–5:00 — Architecture, tradeoffs, next step

Show the boundary description and repository.

“The implementation is one Node service, SQLite, Playwright, and a small frontend. Candidate inputs select four reviewed frontend modules; no arbitrary code or URLs are accepted. The storage observer has a read-only connection. Browser requests are allowlisted, and each run gets its own workspace.”

“The service and host are trusted. This is not a sandbox for hostile backend patches, and it doesn't test persistence across a server restart. The first extension would be recorded agent patches with independently retained task contracts; general untrusted execution would require a real isolation boundary.”

“I used AI assistance, and the actual implementation and packaging time is recorded in the repository. My total time, including review and this recording, was [insert truthful total].”

## Submission check

- Record approximately five minutes in your own voice.
- Ensure the video link is viewable without reviewer sign-in.
- Add your human review, editing, and recording time to TIMELOG.md.
- Confirm the public demo and repository links work in a signed-out browser.
- Do not submit the script as though it were the self-recorded video.
