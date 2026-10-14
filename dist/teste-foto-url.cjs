require("dotenv").config();
const axios = require("axios");

async function main() {
  try {
    const base = process.env.EVOLUTION_URL.replace(/\/+$/, "");
    const instance = process.env.EVOLUTION_INSTANCE;

    const response = await axios.post(
      `${base}/chat/fetchProfilePictureUrl/${instance}`,
      { number: "5521980262528" },
      { headers: { apikey: process.env.EVOLUTION_API_KEY }, timeout: 15000 }
    );

    const url = response.data?.profilePictureUrl;

    if (!url) {
      console.log("A Evolution não retornou o endereço da foto.");
      return;
    }

    const image = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000
    });

    console.log("Status da imagem:", image.status);
    console.log("Tipo do conteúdo:", image.headers["content-type"]);
    console.log("Tamanho recebido:", image.data.byteLength, "bytes");
  } catch (error) {
    console.log("Status HTTP:", error.response?.status || "sem resposta HTTP");
    console.log("Tipo do conteúdo:", error.response?.headers?.["content-type"] || "indisponível");
    console.log("Erro:", error.message);
  }
}

main();
