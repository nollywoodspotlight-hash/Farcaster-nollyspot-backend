"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const client_1 = require("@prisma/client");
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const ethers_1 = require("ethers"); // ✅ Moved to top with other imports
dotenv_1.default.config();
const app = (0, express_1.default)();
const prisma = new client_1.PrismaClient();
app.use(express_1.default.json());
app.use((0, cors_1.default)());
// ✅ Test Route
app.get("/", (req, res) => {
    res.send("✅ Backend is running!");
});
// ✅ Get All Posts
app.get("/posts", async (req, res) => {
    try {
        const posts = await prisma.post.findMany();
        res.json(posts);
    }
    catch (error) {
        console.error("❌ Error fetching posts:", error);
        res.status(500).json({ error: "Server error fetching posts" });
    }
});
// ✅ Create a Post
app.post("/posts", async (req, res) => {
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
    }
    catch (error) {
        console.error("❌ Error creating post:", error);
        res.status(500).json({ error: "Server error creating post" });
    }
});
// ✅ ERC-20 ABI for transfers
const erc20ABI = [
    "function transfer(address to, uint256 value) public returns (bool)"
];
// ✅ Payment Route
app.post("/pay", async (req, res) => {
    try {
        const { tokenType, amount, userId } = req.body;
        if (!tokenType || !amount || !userId) {
            return res.status(400).json({ error: "Missing tokenType, amount or userId" });
        }
        const provider = new ethers_1.ethers.JsonRpcProvider(process.env.PROVIDER_URL);
        const wallet = new ethers_1.ethers.Wallet(process.env.MERCHANT_PRIVATE_KEY, provider);
        // ✅ Token Address Selection
        const tokenAddress = tokenType === "$NOLLYSPOT"
            ? process.env.NOLLYSPOT_TOKEN_ADDRESS
            : process.env.NOLLYWOODSPOT_TOKEN_ADDRESS;
        if (!tokenAddress) {
            return res.status(400).json({ error: "Invalid tokenType" });
        }
        const tokenContract = new ethers_1.ethers.Contract(tokenAddress, erc20ABI, wallet);
        const decimals = Number(process.env.TOKEN_DECIMALS) || 18;
        const amountToSend = ethers_1.ethers.parseUnits(amount.toString(), decimals);
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
    }
    catch (error) {
        console.error("❌ Payment error details:", error);
        return res.status(500).json({
            error: "Payment failed",
            reason: error?.message || error,
        });
    }
});
// ✅ Cancel / Refund Route
app.post("/cancel", async (req, res) => {
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
        const provider = new ethers_1.ethers.JsonRpcProvider(process.env.PROVIDER_URL);
        const wallet = new ethers_1.ethers.Wallet(process.env.MERCHANT_PRIVATE_KEY, provider);
        const erc20ABI = ["function transfer(address to, uint256 value) public returns (bool)"];
        const tokenAddress = transaction.tokenType === "$NOLLYSPOT"
            ? process.env.NOLLYSPOT_TOKEN_ADDRESS
            : process.env.NOLLYWOODSPOT_TOKEN_ADDRESS;
        if (!tokenAddress) {
            return res.status(400).json({ error: "Missing or invalid token address" });
        }
        const tokenContract = new ethers_1.ethers.Contract(tokenAddress, erc20ABI, wallet);
        const decimals = Number(process.env.TOKEN_DECIMALS) || 18;
        const amountToRefund = ethers_1.ethers.parseUnits(refundAmount.toString(), decimals);
        // Execute refund
        const refundTx = await tokenContract.transfer(process.env.USER_REFUND_ADDRESS, // Placeholder for now — will be user’s wallet later
        amountToRefund);
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
    }
    catch (error) {
        console.error("❌ Refund error:", error);
        res.status(500).json({
            error: "Refund failed",
            reason: error?.message || error,
        });
    }
});
// ✅ Get All Transactions
app.get("/transactions", async (req, res) => {
    try {
        const transactions = await prisma.transaction.findMany({
            orderBy: { createdAt: "desc" },
        });
        res.json(transactions);
    }
    catch (error) {
        console.error("❌ Error fetching transactions:", error);
        res.status(500).json({ error: "Failed to fetch transactions" });
    }
});
// ✅ Health Check Route
app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});
// ✅ Start Server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
