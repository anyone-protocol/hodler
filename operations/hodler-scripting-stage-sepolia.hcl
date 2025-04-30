job "hodler-scripting-stage-sepolia" {
    datacenters = ["ator-fin"]
    type = "batch"

    reschedule {
        attempts = 0
    }

    task "deploy-scripting-stage-task" {
        driver = "docker"

        config {
            network_mode = "host"
            image = "ghcr.io/anyone-protocol/hodler:0.1.7"
            entrypoint = ["npx"]
            command = "hardhat"
            args = ["run", "--network", "sepolia", "scripts/lockSize.ts"]
        }

        vault {
            policies = ["hodler-sepolia-stage"]
        }

        template {
            data = <<EOH
            {{with secret "kv/hodler/sepolia/stage"}}
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
