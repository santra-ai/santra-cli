import { Agent } from "undici";

const NVIDIA_DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
const NVIDIA_HEADERS_TIMEOUT_MS = 10 * 60 * 1000;

const nvidiaAgent = new Agent({
  headersTimeout: NVIDIA_HEADERS_TIMEOUT_MS,
  bodyTimeout: NVIDIA_HEADERS_TIMEOUT_MS,
});

function createNvidiaRequest(){
    const baseUrl =  NVIDIA_DEFAULT_BASE_URL;
}

export async function handleNvidiaStream(){

}
