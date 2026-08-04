extends Node

func write_accessibility_evidence(output_path: String, findings: Array, surface_count: int) -> void:
    var document := {
        "schemaVersion": 1,
        "producer": {
            "name": "godot-accessibility-export",
            "version": "1.0.0",
            "kind": "godot-accessibility-server"
        },
        "surfaceCount": surface_count,
        "findings": findings
    }
    var file := FileAccess.open(output_path, FileAccess.WRITE)
    if file == null:
        push_error("Unable to open accessibility evidence output: %s" % output_path)
        return
    file.store_string(JSON.stringify(document, "  "))
    file.store_line("")
