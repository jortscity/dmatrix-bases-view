Run the deploy script to build and copy the plugin to your local Obsidian vault:

```bash
bash deploy.sh
```

If it fails with `.vault-path not found`, create that file first:

```bash
echo "/path/to/your/vault" > .vault-path
```
