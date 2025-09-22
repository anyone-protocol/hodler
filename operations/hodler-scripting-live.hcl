job "hodler-scripting-live" {
    datacenters = ["ator-fin"]
    type = "batch"
    namespace = "live-protocol"

    constraint {
        attribute = "${meta.pool}"
        value = "live-protocol"
    }

    reschedule {
        attempts = 0
    }

    task "hodler-live" {
        driver = "docker"

        config {
            network_mode = "host"
            image = "ghcr.io/anyone-protocol/hodler:0.1.8"
            entrypoint = ["npx"]
            command = "hardhat"
            args = ["run", "--network", "sepolia", "scripts/lockSize.ts"]
        }

        vault {
            role = "any1-nomad-workloads-owner"
        }

        consul {}

        template {
            data = <<EOH
            {{with secret "kv/live-protocol/hodler-live"}}
                HODLER_OPERATOR_KEY="{{.Data.data.HODLER_OPERATOR_KEY}}"
                CONSUL_TOKEN="{{.Data.data.CONSUL_TOKEN}}"
                JSON_RPC="{{.Data.data.JSON_RPC}}"
            {{end}}
            EOH
            destination = "secrets/file.env"
            env         = true
        }

        env {
            PHASE="live"
            CONSUL_IP="127.0.0.1"
            CONSUL_PORT="8500"
            HODLER_CONSUL_KEY="hodler/sepolia/live/address"
        }

        restart {
            attempts = 0
            mode = "fail"
        }

        resources {
            cpu    = 4096
            memory = 4096
        }
    }
}
