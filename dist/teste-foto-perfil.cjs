require("dotenv").config();
const axios = require("axios");

async function main() {
  const number = "5521980262528";
  const base = process.env.EVOLUTION_URL.replace(/\/+$/, "");
  const instance = process.env.EVOLUTION_INSTANCE;

  try {
    const response = await axios.post(
      `${base}/chat/fetchProfilePictureUrl/${instance}`,
      { number },
      {
        headers: {
          apikey: process.env.EVOLUTION_API_KEY,
          "Content-Type": "application/json"
        },
        timeout: 15000
      }
    );

    console.log("HTTP:", response.status);
    console.log("Campos:", Object.keys(response.data || {}).join(", "));
    console.log("Foto retornada:", Boolean(response.data?.profilePictureUrl));
    console.log("WUID:", response.data?.wuid || "não retornado");
  } catch (error) {
    console.log("HTTP:", error.response?.status || "sem resposta HTTP");
    console.log("Erro:", JSON.stringify(error.response?.data || error.message));
  }
}

main();
