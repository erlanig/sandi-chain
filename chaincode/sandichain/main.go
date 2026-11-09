package main

import (
	"log"

	"github.com/fadhailabima/sandi-chain/chaincode/sandichain/contract"
	"github.com/hyperledger/fabric-contract-api-go/v2/contractapi"
)

func main() {
	cc, err := contractapi.NewChaincode(&contract.SandiContract{})
	if err != nil {
		log.Panicf("gagal membuat chaincode sandichain: %v", err)
	}
	cc.Info.Title = "SANDI-Chain"
	cc.Info.Version = "1.0.0"

	if err := cc.Start(); err != nil {
		log.Panicf("gagal menjalankan chaincode sandichain: %v", err)
	}
}
