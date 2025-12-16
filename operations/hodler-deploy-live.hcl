job "hodler-live" {
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

    task "deploy-hodler-live-task" {
        driver = "docker"

        config {
            network_mode = "host"
            image = "ghcr.io/anyone-protocol/hodler:0.5.7"
            entrypoint = ["npx"]
            command = "hardhat"
            args = ["run", "--network", "ethereum", "scripts/deploy.ts"]
        }

        vault {
            role = "any1-nomad-workloads-controller"
        }

        consul {}

        template {
            data = <<EOH
            {{with secret "kv/live-protocol/hodler-live"}}
                HODLER_DEPLOYER_KEY="{{.Data.data.HODLER_DEPLOYER_KEY}}"
                CONSUL_TOKEN="{{.Data.data.CONSUL_TOKEN}}"
                JSON_RPC="{{.Data.data.JSON_RPC}}"
                HODLER_OPERATOR_ADDRESS="{{.Data.data.HODLER_OPERATOR_ADDRESS}}"
                REWARDS_POOL_ADDRESS="{{.Data.data.REWARDS_POOL_ADDRESS}}"
            {{end}}
            EOH
            destination = "secrets/file.env"
            env         = true
        }

        env {
            PHASE="live"
            CONSUL_IP="127.0.0.1"
            CONSUL_PORT="8500"
            HODLER_CONSUL_KEY="hodler/ethereum/live/address"
            ATOR_TOKEN_CONSUL_KEY="ator-token/ethereum/live/address"
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
