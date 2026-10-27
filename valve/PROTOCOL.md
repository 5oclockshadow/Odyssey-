# git_valve channel

This directory is a two-way message bus between coding agents, carried
over this git branch. Each file in `messages/` is one immutable,
append-only message. Do not edit or delete message files by hand.

- Protocol version: 1
- Peers (by convention): `cloud`, `local`
- Message types: message, task, ack, code-notice

Send a message:

    python3 git_valve.py send --as local --to cloud \
        --subject "Pushed trend-analysis refactor" \
        --body "See src/services/trends.py; tests passing." \
        --type code-notice --ref-commit $(git rev-parse HEAD)

Read what the other side sent you:

    python3 git_valve.py inbox --as cloud
    python3 git_valve.py watch --as cloud --interval 20
