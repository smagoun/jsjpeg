/**
 * Constant used in IDCT
 */
const INV_SQRT2 = 1 / Math.SQRT2;

/**
 * Precalcuated values for speeding up IDCT
 */
let idctCache;

/**
 * 'C' function defined in the IDCT operation
 * 
 * @param {*} val 
 */
function C(val) {
    return (val === 0 ? INV_SQRT2 : 1);
}

/**
 * Implement the Inverse Discrete Cosine Transformation defined in the JPEG spec.
 * Naïve implementation that does not use caching, so it's slow.
 * 
 * Returns an array of the IDCT'ed coefficients
 * 
 * @param {*} coeffs Array of 64 coefficients to be processed
 */
function idct(coeffs) {
    let ret = new Array(coeffs.length);
    for (let y = 0, ystart = 0; y < DATA_UNIT_SIZE; y++, ystart += DATA_UNIT_SIZE) {
        for (let x = 0; x < DATA_UNIT_SIZE; x++) {
            let sum = 0;
            for (let v = 0, vstart = 0; v < DATA_UNIT_SIZE; v++, vstart += DATA_UNIT_SIZE) {
                for (let u = 0; u < DATA_UNIT_SIZE; u++) {
                    sum += C(u) * C(v) * coeffs[vstart + u]
                        * Math.cos((((2*x)+1) * u * Math.PI) / 16)
                        * Math.cos((((2*y)+1) * v * Math.PI) / 16);
                }
            }
            ret[ystart + x] = Math.round(sum / 4);
        }
    }
    return ret;
}

/**
 * Initialized cache of precomputed values for IDCT 
 */
function initIDCTCache() {
    idctCache = [
        [], [], [], [], [], [], [], [],
    ];
    for (let j = 0; j < DATA_UNIT_SIZE; j++) {
        for (let i = 0; i < DATA_UNIT_SIZE; i++) {
            idctCache[i][j] = Math.cos((((2*i)+1) * j * Math.PI) / 16);
        }
    }
}

/**
 * Implement the Inverse Discrete Cosine Transformation defined in the JPEG spec.
 * 
 * Returns an array of the IDCT'ed coefficients
 * 
 * @param {*} coeffs Array of 64 coefficients to be processed
 */
function idctCached(coeffs) {
    if (idctCache === undefined) {
        initIDCTCache();
    }
    let ret = new Array(coeffs.length);
    for (let y = 0, ystart = 0; y < DATA_UNIT_SIZE; y++, ystart += DATA_UNIT_SIZE) {
        for (let x = 0; x < DATA_UNIT_SIZE; x++) {
            let sum = 0;
            for (let v = 0, vstart = 0; v < DATA_UNIT_SIZE; v++, vstart += DATA_UNIT_SIZE) {
                for (let u = 0; u < DATA_UNIT_SIZE; u++) {
                    sum += C(u) * C(v) * coeffs[vstart + u] * idctCache[x][u] * idctCache[y][v];
                }
            }
            ret[ystart + x] = Math.round(sum / 4);
        }
    }
    return ret;
}

/**
 * Integer IDCT decoder ported from https://web.ece.ucsb.edu/EXPRESS/benchmark/mpeg2enc/idctcol.c
 * with help from NanoJPEG: http://svn.emphy.de/nanojpeg/trunk/nanojpeg/nanojpeg.c
 * 
 * Returns an array of the IDCT'ed coefficients
 * 
 * @param {*} coeffs Array of 64 coefficients to be processed
 */
function idctChenWang(coeffs) {
    for (let row = 0; row < 64; row += 8) {
        idctrow(coeffs, row);
    }
    for (let col = 0; col < 8; col++) {
        idctcol(coeffs, col)
    }
    return coeffs;
}


const W1 = 2841   // 2048*sqrt(2)*cos(1*pi/16)
const W2 = 2676   // 2048*sqrt(2)*cos(2*pi/16)
const W3 = 2408   // 2048*sqrt(2)*cos(3*pi/16)
const W5 = 1609   // 2048*sqrt(2)*cos(5*pi/16)
const W6 = 1108   // 2048*sqrt(2)*cos(6*pi/16)
const W7 = 565    // 2048*sqrt(2)*cos(7*pi/16)

/**
 * Implement 1-D IDCT on each row of the block
 * 
 * @param {*} blk 
 * @param {*} idx 
 */
function idctrow(blk, idx) {
    let x0, x1, x2, x3, x4, x5, x6, x7, x8;

    // Shortcut
    if (!((x1 = blk[4 + idx] << 11)
        | (x2 = blk[6 + idx])
        | (x3 = blk[2 + idx])
        | (x4 = blk[1 + idx])
        | (x5 = blk[7 + idx])
        | (x6 = blk[5 + idx])
        | (x7 = blk[3 + idx]))) {
            let tmp = blk[0 + idx] << 3;
            let rowend = idx + 8;
            for (let i = idx; i < rowend; i++) {
                blk[i] = tmp;
            }
            return;
    }
    x0 = (blk[0 + idx] << 11) + 128;

    /* first stage */
    x8 = W7*(x4+x5);
    x4 = x8 + (W1-W7)*x4;
    x5 = x8 - (W1+W7)*x5;
    x8 = W3*(x6+x7);
    x6 = x8 - (W3-W5)*x6;
    x7 = x8 - (W3+W5)*x7;

    /* second stage */
    x8 = x0 + x1;
    x0 -= x1;
    x1 = W6*(x3+x2);
    x2 = x1 - (W2+W6)*x2;
    x3 = x1 + (W2-W6)*x3;
    x1 = x4 + x6;
    x4 -= x6;
    x6 = x5 + x7;
    x5 -= x7;

    /* third stage */
    x7 = x8 + x3;
    x8 -= x3;
    x3 = x0 + x2;
    x0 -= x2;
    x2 = (181*(x4+x5)+128)>>8;
    x4 = (181*(x4-x5)+128)>>8;

    /* fourth stage */
    blk[0 + idx] = (x7+x1)>>8;
    blk[1 + idx] = (x3+x2)>>8;
    blk[2 + idx] = (x0+x4)>>8;
    blk[3 + idx] = (x8+x6)>>8;
    blk[4 + idx] = (x8-x6)>>8;
    blk[5 + idx] = (x0-x4)>>8;
    blk[6 + idx] = (x3-x2)>>8;
    blk[7 + idx] = (x7-x1)>>8;
}

/**
 * Implement 1-D IDCT on each column of the block
 * 
 * @param {*} blk 
 * @param {*} idx 
 */
function idctcol(blk, idx) {
    let x0, x1, x2, x3, x4, x5, x6, x7, x8;

    /* shortcut */
    if (!((x1 = blk[idx+8*4]<<8)
        | (x2 = blk[idx+8*6])
        | (x3 = blk[idx+8*2])
        | (x4 = blk[idx+8*1])
        | (x5 = blk[idx+8*7])
        | (x6 = blk[idx+8*5])
        | (x7 = blk[idx+8*3]))) {
        let tmp = clampIdct((blk[idx+8*0]+32)>>6);
        for (let i = 0; i < 8; i++) {
            blk[idx+8*i] = tmp;
        }
        return;
    }

    x0 = (blk[idx+8*0]<<8) + 8192;

    /* first stage */
    x8 = W7*(x4+x5) + 4;
    x4 = (x8+(W1-W7)*x4)>>3;
    x5 = (x8-(W1+W7)*x5)>>3;
    x8 = W3*(x6+x7) + 4;
    x6 = (x8-(W3-W5)*x6)>>3;
    x7 = (x8-(W3+W5)*x7)>>3;

    /* second stage */
    x8 = x0 + x1;
    x0 -= x1;
    x1 = W6*(x3+x2) + 4;
    x2 = (x1-(W2+W6)*x2)>>3;
    x3 = (x1+(W2-W6)*x3)>>3;
    x1 = x4 + x6;
    x4 -= x6;
    x6 = x5 + x7;
    x5 -= x7;

    /* third stage */
    x7 = x8 + x3;
    x8 -= x3;
    x3 = x0 + x2;
    x0 -= x2;
    x2 = (181*(x4+x5)+128)>>8;
    x4 = (181*(x4-x5)+128)>>8;

    /* fourth stage */
    blk[idx+8*0] = clampIdct((x7+x1)>>14);
    blk[idx+8*1] = clampIdct((x3+x2)>>14);
    blk[idx+8*2] = clampIdct((x0+x4)>>14);
    blk[idx+8*3] = clampIdct((x8+x6)>>14);
    blk[idx+8*4] = clampIdct((x8-x6)>>14);
    blk[idx+8*5] = clampIdct((x0-x4)>>14);
    blk[idx+8*6] = clampIdct((x3-x2)>>14);
    blk[idx+8*7] = clampIdct((x7-x1)>>14);
}

/**
 * Clamp an integer value to the range [-128 - 127]
 * 
 * @param {*} val 
 */
function clampIdct(val) {
    return (val > 127 ? 127 : (val < -128 ? -128 : val));
}
