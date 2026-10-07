export const lyraMembershipAbi = [
  {
    type: "function",
    name: "buy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "packageId", type: "uint8" },
      { name: "sponsor", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "renew",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "priceOf",
    stateMutability: "pure",
    inputs: [{ name: "packageId", type: "uint8" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "event",
    name: "Purchased",
    inputs: [
      { name: "buyer", type: "address", indexed: true },
      { name: "packageId", type: "uint8", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "renewal", type: "bool", indexed: false },
    ],
  },
  {
    type: "event",
    name: "OrbitPaid",
    inputs: [
      { name: "buyer", type: "address", indexed: true },
      { name: "sponsor", type: "address", indexed: true },
      { name: "level", type: "uint8", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;
