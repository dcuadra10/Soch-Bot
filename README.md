# Kingdom Ad & Migration Bot

A Discord bot for managing kingdom advertisements and matching players for migration in Rise of Kingdoms.

## Setup

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Environment Variables**:
    Create a `.env` file in the root directory:
    ```env
    DATABASE_URL="postgresql://neondb_owner:npg_u35qARKoDkUi@ep-holy-shadow-a41ip3h2-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
    DISCORD_TOKEN="your_discord_bot_token_here"
    CLIENT_ID="your_client_id_here"
    KING_ROLE_ID="your_king_role_id_here"
    ```

3.  **Database Setup**:
    Initialize the database (NeonDB):
    ```bash
    npx prisma migrate dev --name init_neon
    ```

4.  **Run the Bot**:
    - Development:
      ```bash
      npx ts-node src/index.ts
      ```
    - Production:
      ```bash
      npm run build
      npm start
      ```

## Features

- **/register-kingdom**: Kings can register their kingdom details.
    - **Requirement**: User must have the "King" role (ID configured in `.env`).
- **/find-kingdom**: Players can search for kingdoms matching their Power/KP.
    - Matches show up as buttons.
    - Clicking "Apply" creates a private ticket channel with the King.

## Troubleshooting

- **Prisma Errors**: If you see errors about `DATABASE_URL`, ensure your `.env` file is correct and try running `npx prisma generate`.
- **Bot Permissions**: Ensure the bot has `Manage Channels` and `Manage Roles` permissions to create ticket channels.
