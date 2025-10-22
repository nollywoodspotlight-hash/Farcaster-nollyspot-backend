import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";
import cors from "cors";
import { ethers } from "ethers"; // ✅ Moved to top with other imports

dotenv.config();

const app = express();
const prisma = new PrismaClient();

app.use(express.json());
app.use(cors());

// ✅ Test Route
app.get("/", (req: Request, res: Response) => {
  res.send("✅ Backend is running!");
});

// ✅ Get All Posts
app.get("/posts", async (req: Request, res: Response) => {
  try {
    const posts = await prisma.post.findMany();
    res.json(posts);
  } catch (error) {
    console.error("❌ Error fetching posts:", error);
    res.status(500).json({ error: "Server error fetching posts" });
  }
});

// ✅ Create a Post
app.post("/posts", async (req: Request, res: Response) => {
  try {
    const { title, message, type, priceToken, priceAmount, userId } = req.body;

    if (!title || !message || !type || !priceToken || !priceAmount || !userId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const post = await prisma.post.create({
      data: {
        title,
        message,
        type,
        priceToken,
        priceAmount: Number(priceAmount),
        userId: Number(userId)
      }
    });

    res.json(post);
  } catch (error) {
    console.error("❌ Error creating post:", error);
    res.status(500).json({ error: "Server error creating post" });
  }
});

// ✅ ERC-20 ABI for transfers
const erc20ABI = [
  "function transfer(address to, uint256 value) public returns (bool)"
];

// ✅ Payment Route
app.post("/pay", async (req: Request, res: Response) => {
  try {
    const { tokenType, amount, userId } = req.body;

    if (!tokenType || !amount || !userId) {
      return res.status(400).json({ error: "Missing tokenType, amount or userId" });
    }

    const provider = new ethers.JsonRpcProvider(process.env.PROVIDER_URL);
    const wallet = new ethers.Wallet(process.env.MERCHANT_PRIVATE_KEY!, provider);

    // ✅ Token Address Selection
    const tokenAddress =
      tokenType === "$NOLLYSPOT"
        ? process.env.NOLLYSPOT_TOKEN_ADDRESS
        : process.env.NOLLYWOODSPOT_TOKEN_ADDRESS;

    if (!tokenAddress) {
      return res.status(400).json({ error: "Invalid tokenType" });
    }

    const tokenContract = new ethers.Contract(tokenAddress, erc20ABI, wallet);
    const decimals = Number(process.env.TOKEN_DECIMALS) || 18;
    const amountToSend = ethers.parseUnits(amount.toString(), decimals);

    // ✅ Transfer tokens
    const tx = await tokenContract.transfer(process.env.MERCHANT_ADDRESS, amountToSend);
    await tx.wait();

    // ✅ Save transaction in DB
    await prisma.transaction.create({
      data: {
        userId: Number(userId),
        tokenType,
        amount: Number(amount),
        status: "completed",
        txHash: tx.hash,
      },
    });

    res.json({ success: true, txHash: tx.hash });
  } catch (error: any) {
    console.error("❌ Payment error details:", error);

    return res.status(500).json({
      error: "Payment failed",
      reason: error?.message || error,
    });
  }
}); 

// ✅ Cancel / Refund Route
app.post("/cancel", async (req: Request, res: Response) => {
  try {
    // 🧩 Validate request body early
    if (!req.body || typeof req.body !== "object") {
      return res.status(400).json({ error: "Invalid or missing JSON body" });
    }

    const { transactionId } = req.body;

    if (!transactionId) {
      return res.status(400).json({ error: "Missing transactionId" });
    }

    // Find transaction
    const transaction = await prisma.transaction.findUnique({
      where: { id: Number(transactionId) },
    });

    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    if (transaction.status === "refunded") {
      return res.status(400).json({ error: "Transaction already refunded" });
    }

    // Platform fee setup
    const feePercent = Number(process.env.PLATFORM_FEE_PERCENT) || 2.5;
    const refundAmount = transaction.amount * (1 - feePercent / 100);

    // ERC-20 refund setup
    const provider = new ethers.JsonRpcProvider(process.env.PROVIDER_URL);
    const wallet = new ethers.Wallet(process.env.MERCHANT_PRIVATE_KEY!, provider);

    const erc20ABI = ["function transfer(address to, uint256 value) public returns (bool)"];

    const tokenAddress =
      transaction.tokenType === "$NOLLYSPOT"
        ? process.env.NOLLYSPOT_TOKEN_ADDRESS
        : process.env.NOLLYWOODSPOT_TOKEN_ADDRESS;

    if (!tokenAddress) {
  return res.status(400).json({ error: "Missing or invalid token address" });
}
const tokenContract = new ethers.Contract(tokenAddress as string, erc20ABI, wallet);
    const decimals = Number(process.env.TOKEN_DECIMALS) || 18;
    const amountToRefund = ethers.parseUnits(refundAmount.toString(), decimals);

    // Execute refund
    const refundTx = await tokenContract.transfer(
      process.env.USER_REFUND_ADDRESS, // Placeholder for now — will be user’s wallet later
      amountToRefund
    );
    await refundTx.wait();

    // Update DB
    const updated = await prisma.transaction.update({
      where: { id: transaction.id },
      data: {
        status: "refunded",
        refundTxHash: refundTx.hash,
      },
    });

    res.json({
      success: true,
      refundAmount,
      refundTxHash: refundTx.hash,
      message: `Refund successful minus ${feePercent}% fee.`,
    });
  } catch (error: any) {
    console.error("❌ Refund error:", error);
    res.status(500).json({
      error: "Refund failed",
      reason: error?.message || error,
    });
  }
});
// ✅ Get All Transactions
app.get("/transactions", async (req: Request, res: Response) => {
  try {
    const transactions = await prisma.transaction.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json(transactions);
  } catch (error) {
    console.error("❌ Error fetching transactions:", error);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// ✅ Health Check Route
app.get("/health", (req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

// ✅ Start Server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));