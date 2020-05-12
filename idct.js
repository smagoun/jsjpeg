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
