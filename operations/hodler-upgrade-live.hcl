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

    task "upgrade-hodler-live-task" {
        driver = "docker"

        config {
            network_mode = "host"
            image = "ghcr.io/anyone-protocol/hodler:0.5.2"
            entrypoint = ["npx"]
            command = "hardhat"
            args = ["run", "--network", "sepolia", "scripts/upgrade.ts"]
        }

        vault {
            role = "any1-nomad-workloads-owner"
        }

        consul {}

        template {
            data = <<EOH
            {{with secret "kv/live-protocol/hodler-live"}}
                HODLER_UPGRADER_KEY="{{.Data.data.HODLER_DEPLOYER_KEY}}"
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
            HODLER_OLD_FACTORY_NAME="Hodler"
            HODLER_NEW_FACTORY_NAME="HodlerV5"
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
