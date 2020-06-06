#!/usr/bin/env bash
docker-compose down && docker volume remove sola_db_data && sudo rm -rf ./Sola_Home/* && sudo rm -rf ./Sola_Hashes/* && docker-compose up -d && sleep 5 && npm run create-core -- 8;
