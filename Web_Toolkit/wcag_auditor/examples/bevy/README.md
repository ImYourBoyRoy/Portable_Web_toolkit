# Bevy integration example

Use a Rust test or diagnostic system to inspect the AccessKit nodes and interactions produced by the running Bevy application. Write `native-evidence.example.json` using the published schema, then configure a `native-evidence` or `command-evidence` adapter.

The example document demonstrates the transport contract only. A production collector must derive values from the running accessibility tree and count the nodes or states actually inspected.
