const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'src');

const replacements = [
  // Backgrounds
  { regex: /\bbg-white\b(?! dark:)/g, replacement: 'bg-card text-card-foreground' },
  { regex: /\bbg-gray-50\b(?! dark:)/g, replacement: 'bg-muted/50' },
  { regex: /\bbg-gray-100\b(?! dark:)/g, replacement: 'bg-muted' },
  
  // Texts
  { regex: /\btext-gray-900\b(?! dark:)/g, replacement: 'text-foreground' },
  { regex: /\btext-gray-800\b(?! dark:)/g, replacement: 'text-foreground' },
  { regex: /\btext-gray-500\b(?! dark:)/g, replacement: 'text-muted-foreground' },
  { regex: /\btext-gray-600\b(?! dark:)/g, replacement: 'text-muted-foreground' },
  { regex: /\btext-gray-400\b(?! dark:)/g, replacement: 'text-muted-foreground' },
  { regex: /\btext-gray-300\b(?! dark:)/g, replacement: 'text-muted-foreground opacity-50' },
  
  // Borders
  { regex: /\bborder-gray-100\b(?! dark:)/g, replacement: 'border-border' },
  { regex: /\bborder-gray-200\b(?! dark:)/g, replacement: 'border-border' },
  { regex: /\bborder-gray-300\b(?! dark:)/g, replacement: 'border-input' },
  
  // Hovers
  { regex: /\bhover:bg-gray-50\b(?! dark:)/g, replacement: 'hover:bg-muted/50' },
  
  // Primary (blue)
  { regex: /\bbg-blue-600\b(?! dark:)/g, replacement: 'bg-primary' },
  { regex: /\bhover:bg-blue-700\b(?! dark:)/g, replacement: 'hover:bg-primary/90' },
  { regex: /\btext-blue-600\b(?! dark:)/g, replacement: 'text-primary' },
  { regex: /\btext-blue-700\b(?! dark:)/g, replacement: 'text-primary' },
  { regex: /\bbg-blue-50\b(?! dark:)/g, replacement: 'bg-primary/10' },
  { regex: /\bbg-blue-100\b(?! dark:)/g, replacement: 'bg-primary/20' },
  { regex: /\btext-blue-800\b(?! dark:)/g, replacement: 'text-primary' },
  { regex: /\bhover:text-blue-600\b(?! dark:)/g, replacement: 'hover:text-primary' },
  { regex: /\bhover:bg-blue-50\b(?! dark:)/g, replacement: 'hover:bg-primary/10' },
  { regex: /\bborder-blue-600\b(?! dark:)/g, replacement: 'border-primary' },
  { regex: /\btext-white\b(?! dark:)/g, replacement: 'text-primary-foreground' }, // Might be aggressive but usually in buttons
  
  // Success (green)
  { regex: /\bbg-green-600\b(?! dark:)/g, replacement: 'bg-success' },
  { regex: /\bhover:bg-green-700\b(?! dark:)/g, replacement: 'hover:bg-success/90' },
  { regex: /\btext-green-600\b(?! dark:)/g, replacement: 'text-success' },
  { regex: /\bbg-green-100\b(?! dark:)/g, replacement: 'bg-success/20' },
  { regex: /\btext-green-800\b(?! dark:)/g, replacement: 'text-success' },
  { regex: /\bborder-green-200\b(?! dark:)/g, replacement: 'border-success/30' },
  { regex: /\bhover:text-green-600\b(?! dark:)/g, replacement: 'hover:text-success' },
  { regex: /\bhover:bg-green-50\b(?! dark:)/g, replacement: 'hover:bg-success/10' },

  // Danger (red)
  { regex: /\bbg-red-600\b(?! dark:)/g, replacement: 'bg-danger' },
  { regex: /\bhover:bg-red-700\b(?! dark:)/g, replacement: 'hover:bg-danger/90' },
  { regex: /\btext-red-600\b(?! dark:)/g, replacement: 'text-danger' },
  { regex: /\btext-red-700\b(?! dark:)/g, replacement: 'text-danger' },
  { regex: /\btext-red-800\b(?! dark:)/g, replacement: 'text-danger' },
  { regex: /\bbg-red-50\b(?! dark:)/g, replacement: 'bg-danger/10' },
  { regex: /\bbg-red-100\b(?! dark:)/g, replacement: 'bg-danger/20' },
  { regex: /\bborder-red-200\b(?! dark:)/g, replacement: 'border-danger/30' },
  { regex: /\bhover:text-red-600\b(?! dark:)/g, replacement: 'hover:text-danger' },
  { regex: /\bhover:bg-red-50\b(?! dark:)/g, replacement: 'hover:bg-danger/10' },

  // Amber
  { regex: /\bhover:text-amber-600\b/g, replacement: 'hover:text-amber-500 dark:hover:text-amber-400' },
  { regex: /\bhover:bg-amber-50\b/g, replacement: 'hover:bg-amber-500/10' },
  
  // Purple
  { regex: /\bbg-purple-100\b(?! dark:)/g, replacement: 'bg-purple-500/20' },
  { regex: /\btext-purple-800\b(?! dark:)/g, replacement: 'text-purple-600 dark:text-purple-400' },
  { regex: /\bborder-purple-200\b(?! dark:)/g, replacement: 'border-purple-500/30' },
];

function walk(directory) {
  const files = fs.readdirSync(directory);
  for (const file of files) {
    const fullPath = path.join(directory, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else if (fullPath.endsWith('.tsx')) {
      // Exclude Dashboard and ThemeToggle since we already manually edited them
      if (fullPath.includes('Dashboard.tsx') || fullPath.includes('ThemeToggle.tsx') || fullPath.includes('Login.tsx')) {
        continue;
      }
      
      let content = fs.readFileSync(fullPath, 'utf8');
      let originalContent = content;
      
      for (const rule of replacements) {
        content = content.replace(rule.regex, rule.replacement);
      }
      
      if (content !== originalContent) {
        fs.writeFileSync(fullPath, content);
        console.log(`Updated ${fullPath}`);
      }
    }
  }
}

walk(dir);
