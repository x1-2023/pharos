const { ethers } = require("ethers");
const settings = require("../config/config");
const { SWAP_ROUTER_ABI } = require("./ABI");

// const provider = new ethers.JsonRpcProvider(settings.RPC_URL);

const EXPOLER = "https://testnet.pharosscan.xyz/tx/";
const CHAIN_ID = 688688;

const WPHRS_ADDRESS = "0x76aaada469d23216be5f7c596fa25f282ff9b364";
const USDC_ADDRESS = "0x4d21582f50Fb5D211fd69ABF065AD07E8738870D";
const USDT_ADDRESS = "0x2eD344c586303C98FC3c6D5B42C5616ED42f9D9d";

const SWAP_ROUTER_ADDRESS = "0x1a4de519154ae51200b0ad7c90f7fac75547888a";

const ROUTER_ABI = [
  "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)",
  "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
  "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)",
];

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function transfer(address to, uint amount) returns (bool)",
  "function deposit() payable returns ()",
  "function withdraw(uint256 wad) returns ()",
];

async function swap_01(privateKey) {
  try {
    const wallet = new ethers.Wallet(privateKey, provider);

    const ROUTER = "0x1a4de519154ae51200b0ad7c90f7fac75547888a";
    const TOKEN_IN = "0x76aaada469d23216be5f7c596fa25f282ff9b364";
    const TOKEN_OUT = "0xad902cf99c2de2f1ba5ec4d642fd7e49cae9ee37";
    const RECIPIENT = wallet.address;
    const FEE = 500;
    const AMOUNT_IN = BigInt("10000000000000");
    const AMOUNT_OUT_MIN = BigInt("26326000000053");

    const deadline = Math.floor(Date.now() / 1000) + 60 * 10;

    const iface = new ethers.Interface([
      "function exactInputSingle(address tokenIn, address tokenOut, uint24 fee, address recipient,  uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)",
    ]);

    const encodedExactInput = iface.encodeFunctionData("exactInputSingle", [TOKEN_IN, TOKEN_OUT, FEE, RECIPIENT, AMOUNT_IN, AMOUNT_OUT_MIN, 0]);

    const collectionAndSelfcalls = BigInt("1747375241");
    const abiCoder = new ethers.AbiCoder();
    const encodedParams = abiCoder.encode(["uint256", "bytes[]"], [collectionAndSelfcalls, [encodedExactInput]]);

    const tx = await wallet.sendTransaction({
      to: ROUTER,
      data: "0x5ae401dc" + encodedParams.slice(2),
      value: AMOUNT_IN,
      gasLimit: 200000,
      gasPrice: ethers.parseUnits("1", "gwei"),
    });

    console.log("Tx sent:", tx.hash);
    await tx.wait();
    console.log("✅ Swap ke USDC selesai!");
  } catch (error) {
    console.log(error.message);
  }
}

async function swapToken(params) {
  // return await swap_01(privateKey);
  const { amount, provider, wallet } = params;
  try {
    const contract = new ethers.Contract(WPHRS_ADDRESS, ERC20_ABI, wallet);
    const swapContract = new ethers.Contract(SWAP_ROUTER_ADDRESS, SWAP_ROUTER_ABI, wallet);
    let isDirectSwap = true;
    let tokenOut = USDC_ADDRESS;

    const balance = await provider.getBalance(wallet.address);

    if (balance < ethers.parseEther("0.0001")) {
      return {
        tx: null,
        success: false,
        message: "Insufficient PHRS for swap",
      };
    }

    const allowance = await contract.allowance(wallet.address, SWAP_ROUTER_ADDRESS);
    let amountInWei = ethers.parseEther(amount);

    if (allowance < amountInWei) {
      console.log(`[${wallet.address}] Approving WPHRS...`.blue);
      const approveTx = await contract.approve(SWAP_ROUTER_ADDRESS, amountInWei, { gasLimit: 46551 });
      await approveTx.wait();
      console.log(`[${wallet.address}] Approval successful: ${EXPOLER}${approveTx.hash}`.green);
    } else {
    }

    const minBalance = amountInWei + ethers.parseEther("0.00005");
    if (balance < minBalance) {
      return {
        tx: null,
        success: false,
        message: `Insufficient PHRS. Need at least ${ethers.formatEther(minBalance)} PHRS, have ${ethers.formatEther(balance)} PHRS.`,
      };
    }

    try {
      const amountOutMinimum = 0;
      let encodedData;
      const swapInterface = new ethers.Interface(SWAP_ROUTER_ABI);

      if (isDirectSwap) {
        const normalizedWxosAddress = WPHRS_ADDRESS.toLowerCase();
        const normalizedTokenOut = tokenOut.toLowerCase();
        const isTokenInWphrs = normalizedWxosAddress < normalizedTokenOut;

        const swapParams = {
          tokenIn: isTokenInWphrs ? WPHRS_ADDRESS : tokenOut,
          tokenOut: isTokenInWphrs ? tokenOut : WPHRS_ADDRESS,
          fee: 500,
          recipient: wallet.address,
          amountIn: amountInWei,
          amountOutMinimum,
          sqrtPriceLimitX96: 0,
        };

        encodedData = swapInterface.encodeFunctionData("exactInputSingle", [swapParams]);
      } else {
        const path = ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint24", "address", "uint24", "address"], [WPHRS_ADDRESS, 500, USDC_ADDRESS, 500, tokenOut]);
        const swapParams = {
          path,
          recipient: wallet.address,
          amountIn: amountInWei,
          amountOutMinimum,
        };

        encodedData = swapInterface.encodeFunctionData("exactInput", [swapParams]);
      }

      const multicallData = [encodedData];

      let gasLimit;
      try {
        gasLimit = await swapContract.multicall.estimateGas(multicallData, { value: amountInWei });
        gasLimit = (gasLimit * 120n) / 100n;
      } catch (gasError) {
        console.log(gasError.message);
        gasLimit = isDirectSwap ? 200000 : 300000;
      }

      const collectionAndSelfcalls = BigInt("1747375241");
      const encodedParams = new ethers.AbiCoder().encode(["uint256", "bytes[]"], [collectionAndSelfcalls, [encodedData]]);
      // const tx = await wallet.sendTransaction({
      //   to: SWAP_ROUTER_ADDRESS,
      //   data: "0x5ae401dc" + encodedParams.slice(2),
      //   value: amountInWei,
      //   gasLimit: 200000,
      //   gasPrice: ethers.parseUnits("1", "gwei"),
      // });
      console.log(multicallData, gasLimit);
      const tx = await swapContract.multicall(multicallData, {
        value: amountInWei,
        gasLimit,
      });

      await tx.wait();
      return {
        tx: tx.hash,
        success: true,
        message: `Swap ${amount} success: ${EXPOLER}${tx.hash}`,
      };
    } catch (swapError) {
      return {
        tx: null,
        success: false,
        message: `Swap ${amount} failed for: ${swapError.message}`,
      };
    }
  } catch (error) {
    return {
      tx: null,
      success: false,
      message: `Error swap: ${error.message}`,
    };
  }
}

async function wrapToken(params) {
  const { action, amount, privateKey, provider } = params;
  const wallet = new ethers.Wallet(privateKey, provider);
  try {
    const balance = await provider.getBalance(wallet.address);
    if (balance < ethers.parseEther("0.0001")) {
      return {
        tx: null,
        success: false,
        message: `Insufficient PHRS for swap`,
      };
    }

    const contract = new ethers.Contract(WPHRS_ADDRESS, ERC20_ABI, wallet);

    const amountWei = ethers.parseEther(amount.toString());
    let tx;

    if (action === "wrap") {
      tx = await contract.deposit({
        value: amountWei,
        gasLimit: 44866,
      });
    } else {
      tx = await contract.withdraw(amountWei, {
        gasLimit: 35116,
      });
    }
    await tx.wait(3);
    return {
      tx: tx.hash,
      success: true,
      message: `Swap ${amount} success: ${EXPOLER}${tx.hash}`,
    };
  } catch (error) {
    await tx.wait();
    return {
      tx: tx.hash,
      success: true,
      message: `Swap ${amount} failed: ${error.message}`,
    };
  }
}

async function checkBalance({ address: tokenAddress, provider, wallet }) {
  try {
    if (tokenAddress) {
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
      const balance = await tokenContract.balanceOf(wallet.address);
      const decimals = 18;
      return parseFloat(ethers.formatUnits(balance, decimals)).toFixed(4);
    } else {
      const balance = await provider.getBalance(wallet.address);
      return parseFloat(ethers.formatEther(balance)).toFixed(4);
    }
  } catch (error) {
    console.log(`[${wallet.address}] Failed to check balance: ${error.message}`);
    return "0";
  }
}

async function sendToken({ recipientAddress, amount, wallet, provider }) {
  try {
    const amountIn = ethers.parseUnits(`${amount}`, 18);
    const balance = await provider.getBalance(wallet.address);

    if (balance < ethers.parseEther("0.0001")) {
      return {
        tx: null,
        success: false,
        message: "Insufficient PHRS for transfer",
      };
    }

    let amountInWei = ethers.parseEther(amount);

    const minBalance = amountInWei + ethers.parseEther("0.000021");
    if (balance < minBalance) {
      return {
        tx: null,
        success: false,
        message: `Insufficient PHRS. Need at least ${ethers.formatEther(minBalance)} PHRS, have ${ethers.formatEther(balance)} PHRS.`,
      };
    }

    const tx = await wallet.sendTransaction({
      to: recipientAddress,
      value: amountIn,
      gasLimit: 21000,
    });
    await tx.wait();

    return {
      tx: tx.hash,
      success: true,
      message: `Send ${amount} PHRS successful! Transaction hash: ${EXPOLER}${tx.hash}`,
    };
  } catch (error) {
    return {
      tx: null,
      success: false,
      message: `Error Send: ${error.message}`,
    };
  }
}

module.exports = { sendToken, checkBalance, swapToken, wrapToken };
