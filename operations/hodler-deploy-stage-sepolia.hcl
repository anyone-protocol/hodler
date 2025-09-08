job "hodler-stage-sepolia" {
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

    task "deploy-hodler-stage-task" {
        driver = "docker"

        config {
            network_mode = "host"
            image = "ghcr.io/anyone-protocol/hodler:0.1.8"
            entrypoint = ["npx"]
            command = "hardhat"
            args = ["run", "--network", "sepolia", "scripts/deploy.ts"]
        }

        vault {
            role = "any1-nomad-workloads-controller"
        }

        consul {}

        template {
            data = <<EOH
            {{with secret "kv/stage-protocol/hodler-stage-sepolia"}}
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
            PHASE="stage"
            CONSUL_IP="127.0.0.1"
            CONSUL_PORT="8500"
            HODLER_CONSUL_KEY="hodler/sepolia/stage/address"
            ATOR_TOKEN_CONSUL_KEY="ator-token/sepolia/stage/address"
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
