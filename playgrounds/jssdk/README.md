# @bitrix24/b24jssdk-playground

A playground for testing the library

## Setting Up the Environment

To work with the project, you need to set up environment variables.

### Setup Steps
1. **Install Dependencies**:

Make sure you have all the necessary dependencies installed. You can do this with:

```bash
npm install
```

2. **Create a `.env.local` File**:

In the root of the project, create a file named `.env.local`. This file will hold sensitive information like URLs, user IDs, and secret keys.

3. **Use the Template to Fill `.env.local`**:

Open the `.env.local.demo` file, which has an example of environment variable settings. Copy its contents into your `.env.local` file and replace the placeholders with your own values:

```plaintext
# Specify the domain of Bitrix24. For example: https://your_domain.bitrix24.com
VITE_B24_HOOK_URL="insert_url"

# Enter user ID. For example: 123
VITE_B24_HOOK_USER_ID="insert_user_id"

# Specify the secret. For example: k32t88gf3azpmwv3
VITE_B24_HOOK_SECRET="insert_secret"
```

4. **Make Sure `.env.local` is in `.gitignore`**:

Check that the `.env.local` file is listed in `.gitignore` so it doesn't get pushed to the repository:

```plaintext
.env.local
```

5. **Run the Project**:

Once the environment variables are set, you can start the project with:

```bash
npm run dev
```

### Using the Configuration

The project uses a `config.ts` file to load and use environment variables. You can import and use the configuration like this:

```typescript
import b24HookConfig from './config';

console.log('Bitrix24 URL:', b24HookConfig.b24Url);
console.log('User ID:', b24HookConfig.userId);
```