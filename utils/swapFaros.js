const { ethers } = require("ethers");
const settings = require("../config/config");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const AbortController = require("abort-controller");
const EXPOLER = "https://testnet.pharosscan.xyz/tx/";
const CHAIN_ID = 688688;

const WPHRS_ADDRESS = "0x3019b247381c850ab53dc0ee53bce7a07ea9155f";
const SWAP_ROUTER_ADDRESS = "0x1a4de519154ae51200b0ad7c90f7fac75547888a";

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint amount) returns (bool)",
  "function deposit() payable returns ()",
  "function withdraw(uint256 wad) returns ()",
  "function multicall(uint256, bytes[]) public payable returns (bytes[] memory)",
  "function exactInputSingle((address,address,uint24,address,uint256,uint256,uint160)) external payable returns (uint256)",
];

const pairOptions = [
  { id: 1, from: "WPHRS", to: "USDC" },
  { id: 2, from: "USDC", to: "WPHRS" },
  { id: 3, from: "WPHRS", to: "USDT" },
  { id: 4, from: "USDT", to: "WPHRS" },
  { id: 5, from: "PHRS", to: "USDC" },
  { id: 6, from: "USDC", to: "PHRS" },
  { id: 7, from: "PHRS", to: "USDT" },
  { id: 8, from: "USDT", to: "PHRS" },
  { id: 9, from: "WPHRS", to: "PHRS" },
  { id: 10, from: "PHRS", to: "WPHRS" },
];
const tokenDecimals = {
  WPHRS: 18,
  USDC: 18,
  USDT: 18,
};

const tokens = {
  PHRS: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
  USDC: "0x72df0bcd7276f2dFbAc900D1CE63c272C4BCcCED",
  USDT: "0xD4071393f8716661958F766DF660033b3d35fD29",
  WPHRS: "0x3019b247381c850ab53dc0ee53bce7a07ea9155f",
};

const PHAROS_CHAIN_ID = 688688;

class SwapService {
  constructor({ wallet, log, provider, proxy }) {
    this.wallet = wallet;
    this.log = log;
    this.provider = provider;
    this.proxy = proxy;
  }

  async retryAsync(fn, tries = 10, delayMs = 1200, label = "") {
    let lastErr;
    for (let i = 1; i <= tries; i++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        this.log(`${label} Retry ${i} failed: ${err.message}`, true);
        if (i < tries) await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw lastErr;
  }

  async fetchWithTimeoutAndProxy(url, timeout = 10000, proxy = "") {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    let options = { signal: controller.signal };
    if (proxy) {
      const HttpsProxyAgent = (await import("https-proxy-agent")).HttpsProxyAgent;
      options.agent = new HttpsProxyAgent(proxy);
    }
    try {
      const res = await fetch(url, options);
      clearTimeout(id);
      return res;
    } catch (err) {
      throw new Error("Timeout or network error");
    }
  }

  async robustFetchDodoRoute(url, proxy) {
    return retryAsync(
      async () => {
        const res = await this.fetchWithTimeoutAndProxy(url, 10000, proxy);
        const data = await res.json();
        if (data.status !== -1) return data;
        throw new Error("DODO API status -1");
      },
      10,
      1200,
      "DODO API"
    );
  }

  async fetchDodoRoute(fromAddr, toAddr, userAddr, amountWei, proxy) {
    const deadline = Math.floor(Date.now() / 1000) + 600;
    const url = `https://api.dodoex.io/route-service/v2/widget/getdodoroute?chainId=${PHAROS_CHAIN_ID}&deadLine=${deadline}&apikey=a37546505892e1a952&slippage=3.225&source=dodoV2AndMixWasm&toTokenAddress=${toAddr}&fromTokenAddress=${fromAddr}&userAddr=${userAddr}&estimateGas=true&fromAmount=${amountWei}`;
    try {
      this.log(`DODO API: ${url}`, true);
      const result = await this.robustFetchDodoRoute(url, proxy);
      return result.data;
    } catch (err) {
      this.log(`❌ DODO API fetch failed: ${err.message}`);
      throw err;
    }
  }

  async waitForReceiptWithRetry(tx, tries = 20, delayMs = 4000) {
    let lastErr;
    let provider = tx.provider;
    for (let i = 1; i <= tries; i++) {
      try {
        const receipt = await provider.getTransactionReceipt(tx.hash);
        if (receipt) return receipt;
      } catch (e) {
        lastErr = e;
        this.log(`[${tx.hash}] Manual receipt poll retry ${i} failed: ${e.message}`);
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
    if (lastErr) throw lastErr;
    throw new Error(`Timeout waiting for receipt for ${tx.hash}`);
  }

  async executeSwap(wallet, routeData, label) {
    let tries = 0;
    let lastError = null;
    while (++tries <= 10) {
      try {
        const tx = await wallet.sendTransaction({
          to: routeData.to,
          data: routeData.data,
          value: BigInt(routeData.value),
          gasLimit: BigInt(routeData.gasLimit || 300000),
        });
        this.log(`[${wallet.address}] 🚀 ${label} Swap TX sent: ${tx.hash}`);
        let receipt;
        try {
          receipt = await this.waitForReceiptWithRetry(tx, 20, 4000);
        } catch (waitErr) {
          this.log(`[${wallet.address}] ❌ Failed to get receipt after 20 tries: ${waitErr.message}`);
          break;
        }
        if (receipt.status === 0) {
          this.log(`[${wallet.address}] ❌ TX reverted on-chain (status 0), not retrying: ${tx.hash}`);
          break;
        }
        this.log(`[${wallet.address}] ✅ TX confirmed: ${tx.hash}`);
        return;
      } catch (e) {
        if (
          e.code === "CALL_EXCEPTION" ||
          (e.error && typeof e.error.message === "string" && e.error.message.toLowerCase().includes("revert")) ||
          (e.message && e.message.toLowerCase().includes("revert"))
        ) {
          this.log(`[${wallet.address}] ❌ Swap failed (on-chain revert, not retrying): ${e.message}`);
          break;
        }
        lastError = e;
        this.log(`[${wallet.address}] Swap TX Retry ${tries} failed: ${e.message}`);
        if (tries < 10) await new Promise((r) => setTimeout(r, 1200));
      }
    }
    if (lastError) this.log(`[${wallet.address}] ❌ Swap final error: ${lastError.message}`);
  }

  async swapToken(params) {
    const wallet = this.wallet;
    const provider = this.provider;
    const { amount: amountIn, pairsInit } = params;
    try {
      const options = pairsInit ? pairsInit : pairOptions;
      const pair = options[Math.floor(Math.random() * options.length)];
      const decimals = tokenDecimals[pair.from];
      const tokenContract = new ethers.Contract(tokens[pair.from], ERC20_ABI, provider);

      const balance = await tokenContract.balanceOf(wallet.address);
      //swap back PHRS 90%
      const amountStableCoinToSwap = ethers.formatUnits((balance * 80n) / 100n, decimals);
      const amount = pair.from === "PHRS" ? amountIn.toString() : Number(amountStableCoinToSwap).toFixed(4);
      const required = ethers.parseUnits(amount.toString(), decimals);

      this.log(`Swapping ${amount} ${pair.from} to ${pair.to}`.blue);

      if (balance < required) {
        if (pair.from !== "WPHRS") {
          return await this.swapToken({
            ...params,
            pairsInit: [
              { id: 1, from: "WPHRS", to: "USDC" },
              { id: 3, from: "WPHRS", to: "USDT" },
            ],
          });
        } else {
          const balanceNative = await provider.getBalance(wallet.address);
          if (balanceNative > required) {
            await this.wrapToken({ ...params, action: "wrap" });
            return await this.swapToken({
              ...params,
            });
          } else
            return {
              tx: null,
              success: false,
              stop: false,
              message: `Insufficient ${pair.from} balance: ${ethers.formatUnits(balance, decimals)} < ${amount}`,
            };
        }
      }

      const res = await this.checkBalanceAndApproval(tokens[pair.from], amount, decimals, SWAP_ROUTER_ADDRESS);

      if (!res.success) {
        return {
          tx: null,
          success: false,
          stop: false,
          message: res.message,
        };
      }
      const value = ethers.parseEther(amount);

      try {
        const pendingNonce = await provider.getTransactionCount(wallet.address, "pending");
        const latestNonce = await provider.getTransactionCount(wallet.address, "latest");

        if (pendingNonce > latestNonce) {
          return {
            tx: null,
            success: false,
            stop: false,
            message: "There are pending transactions. Please wait for them to be completed.",
          };
        }

        const data = await this.fetchDodoRoute(tokens[pair.from], tokens[pair.to], wallet.address, value, this.proxy);
        await this.executeSwap(wallet, data, `90% ${tokens[pair.from]}→${tokens[pair.to]}`);
        await new Promise((r) => setTimeout(r, 1000));

        return {
          tx: tx.hash,
          success: true,
          message: `Swap ${amount} ${pair.from} to ${pair.to} success: ${EXPOLER}${tx.hash}`,
        };
      } catch (error) {
        if (error.code === "NONCE_EXPIRED" || error.message.includes("TX_REPLAY_ATTACK")) {
          return {
            tx: null,
            success: false,
            stop: true,
            message: "Nonce conflict detected. Please retry the transaction.",
          };
        }
        return {
          tx: null,
          success: false,
          stop: false,
          message: `Swap ${amount} ${pair.from} to ${pair.to} failed for: ${error.message}`,
        };
      }
    } catch (error) {
      return {
        tx: null,
        success: false,
        stop: false,
        message: `Error swap: ${error.message}`,
      };
    }
  }

  async wrapToken(params) {
    let { action, amount, wallet, balance } = params;
    amount = Number(amount) * 2;
    try {
      if (balance < ethers.parseEther("0.0001")) {
        return {
          tx: null,
          success: false,
          stop: false,
          message: `Insufficient PHRS for wrap WPHRS`,
        };
      }

      const contract = new ethers.Contract(WPHRS_ADDRESS, ERC20_ABI, wallet);

      const amountWei = ethers.parseEther(amount.toString());
      let tx;

      if (action === "wrap") {
        tx = await contract.deposit({
          value: amountWei,
          gasLimit: 100000,
        });
      } else {
        tx = await contract.withdraw(amountWei, {
          gasLimit: 100000,
        });
      }
      await tx.wait(3);
      return {
        tx: tx.hash,
        success: true,
        message: `Swap ${amount} success: ${EXPOLER}${tx.hash}`,
      };
    } catch (error) {
      return {
        tx: tx.hash,
        success: true,
        message: `Swap ${amount} failed: ${error.message}`,
      };
    }
  }
}

module.exports = SwapService;
