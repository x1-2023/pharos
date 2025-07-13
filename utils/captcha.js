const config = require("../config/config");
const colors = require("colors");
const axios = require("axios");
const FormData = require("form-data");

const solve2Captcha = async (params) => {
  let retries = 5;
  try {
    // Step 1: Create a CAPTCHA task
    const taskResponse = await axios.post(
      "https://api.2captcha.com/createTask",
      {
        clientKey: config.API_KEY_2CAPTCHA,
        task: {
          type: "TurnstileTaskProxyless",
          websiteURL: params.websiteURL,
          websiteKey: params.websiteKey,
        },
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    const requestId = taskResponse.data.taskId;
    if (!requestId) throw new Error(`Task creation failed: ${JSON.stringify(taskResponse.data)}`);

    // Step 2: Poll for the result
    let result;
    do {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      const resultResponse = await axios.post(
        "https://api.2captcha.com/getTaskResult",
        {
          clientKey: config.API_KEY_2CAPTCHA,
          taskId: requestId,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      result = resultResponse.data;
      if (result.status === "processing") {
        console.log(colors.yellow("CAPTCHA still processing..."));
      }
      retries--;
    } while (result.status === "processing" && retries > 0);

    // Step 3: Use the CAPTCHA solution
    if (result.status === "ready") {
      console.log(colors.green("CAPTCHA success.."));
      return result.solution.token; // This is the CAPTCHA token
    } else {
      console.error("Error captcha:", result);
      return null;
    }
  } catch (error) {
    console.error("Error captcha:", error.message);
    return null;
  }
};

const solveAntiCaptcha = async (params) => {
  let retries = 5;
  try {
    // Step 1: Create a CAPTCHA task
    const taskResponse = await axios.post(
      "https://api.anti-captcha.com/createTask",
      {
        clientKey: config.API_KEY_ANTI_CAPTCHA,
        task: {
          type: "TurnstileTaskProxyless",
          websiteURL: params.websiteURL,
          websiteKey: params.websiteKey,
        },
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    const requestId = taskResponse.data.taskId;
    if (!requestId) {
      throw new Error("Failed to create CAPTCHA task. No task ID returned.");
    }

    // Step 2: Poll for the result
    let result;
    do {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      const resultResponse = await axios.post(
        "https://api.anti-captcha.com/getTaskResult",
        {
          clientKey: config.API_KEY_ANTI_CAPTCHA,
          taskId: requestId,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      result = resultResponse.data;
      if (result.status === "processing") {
        console.log(colors.yellow("CAPTCHA still processing..."));
      }
      retries--;
    } while (result.status === "processing" && retries > 0);

    // Step 3: Use the CAPTCHA solution
    if (result.status === "ready") {
      console.log(colors.green("CAPTCHA success.."));
      return result.solution.token; // This is the CAPTCHA token
    } else {
      console.error("Error captcha:", result);
      return null;
    }
  } catch (error) {
    console.error("Error captcha:", error.message);
    return null;
  }
};

const solveMonsterCaptcha = async (params) => {
  let retries = 5;
  try {
    // Step 1: Create a CAPTCHA task
    const taskResponse = await axios.post(
      "https://api.capmonster.cloud/createTask",
      {
        clientKey: config.API_KEY_CAPMONSTER,
        task: {
          type: "TurnstileTaskProxyless",
          websiteURL: params.websiteURL,
          websiteKey: params.websiteKey,
        },
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    const requestId = taskResponse.data.taskId;
    if (!requestId) {
      throw new Error("Failed to create CAPTCHA task. No task ID returned.");
    }

    // Step 2: Poll for the result
    let result;
    do {
      await new Promise((resolve) => setTimeout(resolve, 10000));
      const resultResponse = await axios.post(
        "https://api.capmonster.cloud/getTaskResult",
        {
          clientKey: config.API_KEY_CAPMONSTER,
          taskId: requestId,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      result = resultResponse.data;
      if (result.status === "processing") {
        console.log(colors.yellow("CAPTCHA still processing..."));
      }
      retries--;
    } while (result.status === "processing" && retries > 0);

    // Step 3: Use the CAPTCHA solution
    if (result.status === "ready") {
      console.log(colors.green("CAPTCHA success.."));
      return result.solution.token; // This is the CAPTCHA token
    } else {
      console.error("Error captcha:", result);
      return null;
    }
  } catch (error) {
    console.error("Error captcha:", error.message);
    return null;
  }
};

const solveMultibotCaptcha = async (params) => {
  let retries = 60;
  const RETRY_DELAY_MS = 10000;
  
  try {
    // Step 1: Create a CAPTCHA task
    const form = new FormData();
    form.append('key', config.API_KEY_MULTIBOT);
    form.append('method', 'userrecaptcha');
    form.append('pageurl', params.websiteURL);
    form.append('googlekey', params.websiteKey);
    form.append('json', '1');

    console.log(colors.blue("Đang gửi yêu cầu giải mã đến API Multibot..."));
    const taskResponse = await axios.post('http://api.multibot.in/in.php', form, {
      headers: form.getHeaders(),
    });

    if (!taskResponse.data || taskResponse.data.status !== 1) {
      throw new Error(`Task creation failed: ${JSON.stringify(taskResponse.data)}`);
    }

    const taskId = taskResponse.data.request;
    console.log(colors.blue(`Yêu cầu thành công. ID tác vụ là: ${taskId}`));

    // Step 2: Poll for the result
    console.log(colors.blue("Bắt đầu lấy kết quả giải mã..."));
    await new Promise((resolve) => setTimeout(resolve, 15000)); // Wait 15 seconds before checking

    let result;
    do {
      const resultResponse = await axios.get(
        `http://api.multibot.in/res.php?key=${config.API_KEY_MULTIBOT}&id=${taskId}&json=1`
      );
      
      result = resultResponse.data;
      
      if (result.status === 0 && result.request === 'CAPCHA_NOT_READY') {
        console.log(colors.yellow("CAPTCHA still processing..."));
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        retries--;
      } else if (result.status === 1) {
        console.log(colors.green("CAPTCHA success.."));
        return result.request; // This is the CAPTCHA token
      } else {
        console.error("Error captcha:", result.request || 'Unknown error');
        return null;
      }
    } while (retries > 0);

    console.error("CAPTCHA timeout after maximum retries");
    return null;
  } catch (error) {
    console.error("Error captcha:", error.message);
    return null;
  }
};

const solveCapGuruCaptcha = async (params) => {
  let retries = 60;
  const RETRY_DELAY_MS = 10000;
  
  try {
    // Step 1: Create a CAPTCHA task
    const form = new FormData();
    form.append('key', config.API_KEY_CAPGURU);
    form.append('method', 'userrecaptcha');
    form.append('pageurl', params.websiteURL);
    form.append('googlekey', params.websiteKey);
    form.append('json', '1');

    console.log(colors.blue("Đang gửi yêu cầu giải mã đến API CapGuru..."));
    const taskResponse = await axios.post('http://api2.cap.guru/in.php', form, {
      headers: form.getHeaders(),
    });

    if (!taskResponse.data || taskResponse.data.status !== 1) {
      throw new Error(`Task creation failed: ${JSON.stringify(taskResponse.data)}`);
    }

    const taskId = taskResponse.data.request;
    console.log(colors.blue(`CapGuru yêu cầu thành công. ID tác vụ là: ${taskId}`));

    // Step 2: Poll for the result
    console.log(colors.blue("Bắt đầu lấy kết quả giải mã CapGuru..."));
    await new Promise((resolve) => setTimeout(resolve, 15000)); // Wait 15 seconds before checking

    let result;
    do {
      const resultResponse = await axios.post(
        'http://api2.cap.guru/res.php',
        {
          key: config.API_KEY_CAPGURU,
          action: 'get',
          id: taskId,
          json: 1
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      
      result = resultResponse.data;
      
      if (result.status === 0 && result.request === 'CAPCHA_NOT_READY') {
        console.log(colors.yellow("CAPTCHA still processing..."));
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        retries--;
      } else if (result.status === 1) {
        console.log(colors.green("CAPTCHA success.."));
        return result.request; // This is the CAPTCHA token
      } else {
        console.error("Error captcha:", result.request || 'Unknown error');
        return null;
      }
    } while (retries > 0);

    console.error("CAPTCHA timeout after maximum retries");
    return null;
  } catch (error) {
    console.error("Error captcha:", error.message);
    return null;
  }
};

async function solveCaptcha(
  params = {
    websiteURL: config.CAPTCHA_URL,
    websiteKey: config.WEBSITE_KEY,
  }
) {
  if (config.TYPE_CAPTCHA === "2captcha") {
    return await solve2Captcha(params);
  } else if (config.TYPE_CAPTCHA === "anticaptcha") {
    return await solveAntiCaptcha(params);
  } else if (config.TYPE_CAPTCHA === "monstercaptcha") {
    return await solveMonsterCaptcha(params);
  } else if (config.TYPE_CAPTCHA === "multibot") {
    return await solveMultibotCaptcha(params);
  } else if (config.TYPE_CAPTCHA === "capguru") {
    return await solveCapGuruCaptcha(params);
  }
  console.log(colors.red("Invalid type captcha"));
  return null;
}

module.exports = { solveCaptcha };
