#!/usr/bin/env python3
"""
Initialize a new Hytale Pack with proper folder structure.

Usage:
    python init_pack.py <pack-name> [--path <custom-path>]

Examples:
    python init_pack.py MyAwesomePack
    python init_pack.py MyPack --path "C:/Custom/Path"
"""

import sys
import os
import json
import shutil
from pathlib import Path


def get_default_packs_path():
    """Get the default Hytale Packs directory."""
    appdata = os.environ.get('APPDATA', '')
    if appdata:
        return Path(appdata) / 'Hytale' / 'UserData' / 'Packs'
    return Path.cwd()


def create_manifest(pack_name, author_name="Author"):
    """Create manifest.json content."""
    return {
        "Group": author_name,
        "Name": pack_name,
        "Version": "1.0.0",
        "Description": f"{pack_name} - A custom Hytale Pack",
        "Authors": [
            {"Name": author_name, "Role": "Author"}
        ],
        "ServerVersion": "*",
        "Dependencies": [],
        "OptionalDependencies": [],
        "DisabledByDefault": False
    }


def create_translation(pack_name):
    """Create default English translation."""
    return {
        f"server.{pack_name.lower()}.name": pack_name
    }


def init_pack(pack_name, base_path=None):
    """
    Initialize a new Hytale Pack with folder structure.
    
    Args:
        pack_name: Name of the Pack
        base_path: Optional base path (defaults to Hytale Packs folder)
    
    Returns:
        Path to created Pack, or None if error
    """
    if base_path is None:
        base_path = get_default_packs_path()
    
    pack_path = Path(base_path) / pack_name
    
    if pack_path.exists():
        print(f"❌ Error: Pack already exists: {pack_path}")
        return None
    
    try:
        # Create main folder structure
        pack_path.mkdir(parents=True)
        print(f"✅ Created Pack folder: {pack_path}")
        
        # Create Common folder structure (client-side visuals)
        common_folders = [
            'Common/Icons/ItemsGenerated',
            'Common/Icons/Categories',
            'Common/Models',
            'Common/Textures/Blocks',
        ]
        for folder in common_folders:
            (pack_path / folder).mkdir(parents=True, exist_ok=True)
        print("✅ Created Common/ folder structure")
        
        # Create Server folder structure (server-side logic)
        server_folders = [
            'Server/Blocks',
            'Server/Items',
            'Server/Categories',
            'Server/Translations',
        ]
        for folder in server_folders:
            (pack_path / folder).mkdir(parents=True, exist_ok=True)
        print("✅ Created Server/ folder structure")
        
        # Create manifest.json
        manifest = create_manifest(pack_name)
        manifest_path = pack_path / 'manifest.json'
        with open(manifest_path, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=2)
        print("✅ Created manifest.json")
        
        # Create English translation file
        translation = create_translation(pack_name)
        translation_path = pack_path / 'Server' / 'Translations' / 'en.json'
        with open(translation_path, 'w', encoding='utf-8') as f:
            json.dump(translation, f, indent=2)
        print("✅ Created Server/Translations/en.json")
        
        print(f"\n🎉 Pack '{pack_name}' initialized successfully!")
        print(f"   Location: {pack_path}")
        print("\nNext steps:")
        print("1. Add blocks to Server/Blocks/")
        print("2. Add textures to Common/Textures/Blocks/")
        print("3. Add icons to Common/Icons/ItemsGenerated/")
        print("4. Update translations in Server/Translations/en.json")
        print("5. Enable the Pack in Hytale: Worlds tab → Right-click world → Toggle Pack")
        
        return pack_path
        
    except Exception as e:
        print(f"❌ Error creating Pack: {e}")
        return None


def main():
    if len(sys.argv) < 2:
        print("Usage: python init_pack.py <pack-name> [--path <custom-path>]")
        print("\nExamples:")
        print("  python init_pack.py MyAwesomePack")
        print("  python init_pack.py MyPack --path \"C:/Custom/Path\"")
        sys.exit(1)
    
    pack_name = sys.argv[1]
    base_path = None
    
    # Parse --path argument
    if '--path' in sys.argv:
        path_index = sys.argv.index('--path')
        if path_index + 1 < len(sys.argv):
            base_path = sys.argv[path_index + 1]
    
    print(f"🚀 Initializing Hytale Pack: {pack_name}")
    if base_path:
        print(f"   Custom path: {base_path}")
    else:
        print(f"   Default path: {get_default_packs_path()}")
    print()
    
    result = init_pack(pack_name, base_path)
    sys.exit(0 if result else 1)


if __name__ == "__main__":
    main()
