import { readFile, writeFile } from "fs/promises";

interface Replacement {
  old: string;
  new: string;
}

interface PatchDef {
  file: string;
  replacements: Replacement[];
}

const PATCHES: PatchDef[] = [
  {
    file: "node_modules/butterchurn/dist/butterchurn.js",
    replacements: [
      /* A. OutputShader.updateGlobals — only recompile when FXAA mode changes.
         When only texsize changes, update the uniform instead of recompiling. */
      {
        old: `  updateGlobals(opts) {
    this.textureRatio = opts.textureRatio;
    this.texsizeX = opts.texsizeX;
    this.texsizeY = opts.texsizeY;

    this.gl.deleteProgram(this.shaderProgram);

    if (this.useFXAA()) {
      this.createFXAAShader();
    } else {
      this.createShader();
    }
  }`,
        new: `  updateGlobals(opts) {
    const oldUseFXAA = this.useFXAA();
    this.textureRatio = opts.textureRatio;
    this.texsizeX = opts.texsizeX;
    this.texsizeY = opts.texsizeY;

    if (oldUseFXAA !== this.useFXAA()) {
      this.gl.deleteProgram(this.shaderProgram);
      if (this.useFXAA()) {
        this.createFXAAShader();
      } else {
        this.createShader();
      }
    } else if (this.useFXAA() && this.texsizeLoc) {
      this.gl.useProgram(this.shaderProgram);
      this.gl.uniform4fv(this.texsizeLoc, [
        this.texsizeX,
        this.texsizeY,
        1.0 / this.texsizeX,
        1.0 / this.texsizeY,
      ]);
    }
  }`,
      },
      /* B. WarpShader.createShader — delete old program before creating new one.
         Prevents GPU memory leak when presets change. */
      {
        old: `    this.userTextures = ShaderUtils.getUserSamplers(fragShaderHeaderText);

    this.shaderProgram = this.gl.createProgram();

    const vertShader = this.gl.createShader(this.gl.VERTEX_SHADER);
    this.gl.shaderSource(
      vertShader,
      \`
      #version 300 es
      precision \${this.floatPrecision} float;
      const vec2 halfmad = vec2(0.5);
      in vec2 aPos;
      in vec2 aWarpUv;
      in vec4 aWarpColor;
      out vec2 uv;`,
        new: `    this.userTextures = ShaderUtils.getUserSamplers(fragShaderHeaderText);

    if (this.shaderProgram) {
      this.gl.deleteProgram(this.shaderProgram);
    }
    this.shaderProgram = this.gl.createProgram();

    const vertShader = this.gl.createShader(this.gl.VERTEX_SHADER);
    this.gl.shaderSource(
      vertShader,
      \`
      #version 300 es
      precision \${this.floatPrecision} float;
      const vec2 halfmad = vec2(0.5);
      in vec2 aPos;
      in vec2 aWarpUv;
      in vec4 aWarpColor;
      out vec2 uv;`,
      },
      /* C. CompShader.createShader — same program-leak fix. */
      {
        old: `    this.userTextures = ShaderUtils.getUserSamplers(fragShaderHeaderText);

    this.shaderProgram = this.gl.createProgram();

    const vertShader = this.gl.createShader(this.gl.VERTEX_SHADER);
    this.gl.shaderSource(
      vertShader,
      \`
      #version 300 es
      const vec2 halfmad = vec2(0.5);
      in vec2 aPos;
      in vec4 aCompColor;
      out vec2 vUv;`,
        new: `    this.userTextures = ShaderUtils.getUserSamplers(fragShaderHeaderText);

    if (this.shaderProgram) {
      this.gl.deleteProgram(this.shaderProgram);
    }
    this.shaderProgram = this.gl.createProgram();

    const vertShader = this.gl.createShader(this.gl.VERTEX_SHADER);
    this.gl.shaderSource(
      vertShader,
      \`
      #version 300 es
      const vec2 halfmad = vec2(0.5);
      in vec2 aPos;
      in vec4 aCompColor;
      out vec2 vUv;`,
      },
    ],
  },
  {
    file: "node_modules/webamp/built/webamp.bundle.js",
    replacements: [
      /* D. Reduce mesh resolution (32×24 → 16×12) and cap pixelRatio at 2.
         Cuts per-vertex CPU work by ~75% and avoids massive mobile framebuffers. */
      {
        old: `      meshWidth: 32,
      meshHeight: 24,
      pixelRatio: window.devicePixelRatio || 1`,
        new: `      meshWidth: 16,
      meshHeight: 12,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2)`,
      },
    ],
  },
];

async function applyPatches() {
  for (const patch of PATCHES) {
    let content: string;
    try {
      content = await readFile(patch.file, "utf-8");
    } catch (err) {
      console.warn(`  ⚠ Skip ${patch.file} — file not found`);
      continue;
    }
    let modified = false;

    for (const { old: oldStr, new: newStr } of patch.replacements) {
      if (content.includes(oldStr)) {
        content = content.replace(oldStr, newStr);
        modified = true;
        console.log(`  ✓ Patched ${patch.file}`);
      } else {
        console.warn(`  ⚠ Skip ${patch.file} — old string not found (may already be patched)`);
      }
    }

    if (modified) {
      await writeFile(patch.file, content);
    }
  }
}

applyPatches().catch((err) => {
  console.error(err);
  process.exit(1);
});
