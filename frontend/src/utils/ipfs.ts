const PINATA_JWT = import.meta.env.VITE_PINATA_JWT;
const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs";

export async function uploadFileToPinata(file: File): Promise<string> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body: formData,
  });

  if (!res.ok) throw new Error("IPFS 上傳失敗");
  const data = await res.json();
  return data.IpfsHash as string;
}

export async function uploadJsonToPinata(json: object): Promise<string> {
  const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ pinataContent: json, pinataOptions: { cidVersion: 1 } }),
  });

  if (!res.ok) throw new Error("IPFS JSON 上傳失敗");
  const data = await res.json();
  return data.IpfsHash as string;
}

export function ipfsToHttp(cid: string): string {
  if (!cid || cid === "QmExampleIPFSHash") return "/placeholder.png";
  return `${PINATA_GATEWAY}/${cid}`;
}
