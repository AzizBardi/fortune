const express = require('express');
const bodyParser = require('body-parser');
const Web3 = require('web3');
const EscrowABI = require('./contracts/EscrowAbi.json');
const { uploadResults } = require('./s3');

const app = express();
const privKey = process.env.ETH_PRIVATE_KEY || '4b03dafb5fb7cef5909042fe01aa627440a9db7079d248575414dec8a9042ce0';
const ethHttpServer = process.env.ETH_HTTP_SERVER || 'http://localhost:8547';
const port = process.env.PORT || 3006;

const web3 = new Web3(ethHttpServer);
const account = web3.eth.accounts.privateKeyToAccount(`0x${privKey}`);

web3.eth.accounts.wallet.add(account);
web3.eth.defaultAccount = account.address;

app.use(bodyParser.json());

app.post('/job/results', async function(req, res) {
  try {
    const { fortunes, escrowAddress } = req.body;

    if (!Array.isArray(fortunes) || fortunes.length === 0) {
      return res.status(400).send({ message: 'Fortunes are not specified or empty' })
    }

    if (!web3.utils.isAddress(escrowAddress)) {
      return res.status(400).send({ message: 'Escrow address is empty or invalid' });
    }

    const Escrow = new web3.eth.Contract(EscrowABI, escrowAddress);
    const balance = Number(await Escrow.methods.getBalance().call({ from: account.address }));

    const filteredFortunes = filterFortunes(fortunes);
    const evenWorkerReward = calculateRewardForWorker(balance, filteredFortunes.length);
    const resultsUrl = await uploadResults(fortunes.map(({fortune}) => fortune), escrowAddress); 
    // TODO calculate the URL hash(?)
    const resultHash = resultsUrl;
    const workerAddresses = filteredFortunes.map(fortune => fortune.worker).map(web3.utils.toChecksumAddress);
    const rewards = workerAddresses.map(() => evenWorkerReward.toString());
    const bulkTransactionId = 1;

    await Escrow.methods.bulkPayOut(workerAddresses, rewards, resultsUrl, resultHash, 1).send({from: account.address, gas: 5000000});

    res.status(200).send({ message: 'Escrow has been completed' })
  } catch(err) {
    console.error(err);
    res.status(500).send({ message: err });
  }
});

// leave only unique fortunes
function filterFortunes(addressFortunesEntries) {
  const filteredResults = [];
  const tmpHashMap = {};

  for (let fortuneEntry of addressFortunesEntries) {
    const { fortune } = fortuneEntry;
    if (tmpHashMap[fortune]) {
      continue;
    }

    tmpHashMap[fortune] = true;
    filteredResults.push(fortuneEntry);
  }


  return filteredResults;
}

function calculateRewardForWorker(totalReward, numberOfWorkers) {
  return Math.floor(totalReward / numberOfWorkers);
}

app.listen(port, () => {
  console.log(`Reputation Oracle server listening the port ${port}`);
});
