import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import dotenv from "dotenv";

dotenv.config();
const app = express();
const prisma = new PrismaClient();
app.use(express.json());

// Price settings (in token units)
const PRICES = {
  PROFILE_POST: { amount: 25000, token: "$NOLLYSPOT" },
  BLOG_POST: { amount: 100000, token: "$NOLLYWOODSPOTLIGHT" },
  WEBSITE_POST: { amount: 50000, token: "$NOLLYWOODSPOTLIGHT" },
};

// Create a user or get existing
app.post("/user", async (req, res) => {
  try {
    const { walletAddress } = req.body;
    const user = await prisma.user.upsert({
      where: { walletAddress },
      update: {},
      create: { walletAddress },
    });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create or find user" });
  }
});

// Purchase a shoutout or post
app.post("/purchase", async (req, res) => {
  try {
    const { walletAddress, postType, message, title } = req.body;

    // Find or create user
    const user = await prisma.user.upsert({
      where: { walletAddress },
      update: {},
      create: { walletAddress },
    });

    // Determine price and token
    const priceData = PRICES[postType as keyof typeof PRICES];
    if (!priceData) return res.status(400).json({ error: "Invalid post type" });

    // Record post
    const post = await prisma.post.create({
      data: {
        title,
        message,
        type: postType,
        priceToken: priceData.token,
        priceAmount: priceData.amount,
        userId: user.id,
      },
    });

    // Record transaction
    const tx = await prisma.transaction.create({
      data: {
        userId: user.id,
        tokenType: priceData.token,
        amount: priceData.amount,
        postId: post.id,
      },
    });

    res.json({ message: "Post and transaction recorded!", post, tx });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Transaction failed" });
  }
});

// Fetch all posts
app.get("/posts", async (req, res) => {
  const posts = await prisma.post.findMany({ include: { user: true } });
  res.json(posts);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
