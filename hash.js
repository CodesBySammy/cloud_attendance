const bcrypt = require('bcrypt');

// Number of salt rounds (higher is more secure but slower)
const saltRounds = 10;

// Function to hash a password
async function hashPassword(plainPassword) {
    const hash = await bcrypt.hash(plainPassword, saltRounds);
    console.log("Hashed Password:", hash);
    return hash;
}

// Function to verify a password
async function verifyPassword(plainPassword, hashedPassword) {
    const match = await bcrypt.compare(plainPassword, hashedPassword);
    console.log("Password match:", match);
    return match;
}

// Example usage
(async () => {
    const password = "sammy";
    const hashed = await hashPassword(password);
    await verifyPassword("sammy", hashed); // Should return true
    await verifyPassword("wrongPassword", hashed); // Should return false
})();
