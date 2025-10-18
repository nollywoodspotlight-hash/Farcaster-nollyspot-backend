-- Create a test user
INSERT INTO "User" ("walletAddress")
VALUES ('0xTESTWALLET123456789abcdef');

-- Create a test post
INSERT INTO "Post" ("title", "message", "type", "priceToken", "priceAmount", "userId")
VALUES ('Test Post', 'This is a test post from seed data.', 'profile', '$NOLLYSPOT', 25000, 1);