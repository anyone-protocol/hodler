job "hodler-scripting-stage" {
    datacenters = ["ator-fin"]
    type = "batch"
    namespace = "stage-protocol"

    constraint {
        attribute = "${meta.pool}"
        value = "stage"
    }

    reschedule {
        attempts = 0
    }

    task "hodler-stage" {
        driver = "docker"

        config {
            network_mode = "host"
            image = "ghcr.io/anyone-protocol/hodler:0.3.4"
            entrypoint = ["npx"]
            command = "hardhat"
            args = ["run", "--network", "sepolia", "scripts/checkVersion.ts"]
        }

        vault {
            role = "any1-nomad-workloads-owner"
        }

        consul {}

        template {
            data = <<EOH
            {{with secret "kv/stage-protocol/hodler-stage"}}
                HODLER_OPERATOR_KEY="{{.Data.data.HODLER_OPERATOR_KEY}}"
                CONSUL_TOKEN="{{.Data.data.CONSUL_TOKEN}}"
                JSON_RPC="{{.Data.data.JSON_RPC}}"
            {{end}}
            EOH
            destination = "secrets/file.env"
            env         = true
        }

        env {
            PHASE="stage"
            CONSUL_IP="127.0.0.1"
            CONSUL_PORT="8500"
            HODLER_CONSUL_KEY="hodler/sepolia/stage/address"
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
