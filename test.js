
/**
 * Utility function to compare test output with expected values
 * 
 * @param {*} testName 
 * @param {*} expected 
 * @param {*} output 
 */
function compareOutput(testName, expected, output) {
    let errCnt = 0;
    for (let i = 0; i < expected.length; i++) {
        let ex = expected[i];
        let out = output[i];
        let ok = true;
        if (Array.isArray(ex)) {    // Compare values, since shallow === doesn't work on arrays
            for (let j = 0; j < ex.length; j++) {
                if (ex[j] != out[j]) {
                    ok = false;
                }
            }
        } else {
            if (ex != out) {
                ok = false;
            }
        }
        if (!ok) {
            errCnt++;
            console.error("Error: " + testName + " output[" + i + "]:" + out + " doesn't match expected value of " + ex);
        }
    }
    console.log(testName + " tests " + (errCnt === 0 ? "passed!" : " failed with " + errCnt + " failures"));
}

function testYCbCrToRGB() {
    // Array of input values and corresponding expected output values
    // Note: Our integer YCbCr --> RGB has rounding errors, hence RGB values like '1', '254'
    let testData = [    // Y, Cb, Cr, R, G, B, A
        [0, 128, 128, 0, 0, 0, 255],    // Black
        [255, 128, 128, 255, 255, 255, 255],  // White
        [76, 85, 255, 254, 0, 0, 255],  // Red
        [150, 44, 21, 0, 255, 1, 255],  // Green
        [29, 255, 107, 0, 0, 254, 255],  // Blue
    ];
    let output = new Array(testData.length);
    for (let i = 0; i < output.length; i++) {
        output[i] = [0, 0, 0, 0];
    }
    let expected = [];
    for (let i = 0; i < testData.length; i++) {
        YCbCrToRGB(testData[i][0], testData[i][1], testData[i][2], output[i]);
        expected[i] = [testData[i][3], testData[i][4], testData[i][5], testData[i][6]];
    }
    testName = "YCbCr to RGB";
    compareOutput(testName, expected, output);
}

function testExtend() {
    // From Table 5 in https://www.impulseadventure.com/photo/jpeg-huffman-coding.html
    let testData = [    // Bitstring, size, expected value. Uses strings for readability (vs 0b...)
        ["0", 0, 0],
        ["0", 1, -1],
        ["1", 1, 1],
        ["00", 2, -3],
        ["001", 3, -6],
        ["110", 3, 6],
        ["10001", 5, 17],
        ["00101", 5, -26],
        ["11110", 5, 30],
        ["0000000000", 10, -1023],
        ["11111111111", 11, 2047],
    ];
    let output = [];
    let expected = [];
    for (let i = 0; i < testData.length; i++) {
        output[i] = extend(parseInt(testData[i][0], 2), testData[i][1]);
        expected[i] = testData[i][2];
    }
    testName = "Extend";
    compareOutput(testName, expected, output);
}

function testLevelShift() {
    // Example data from https://en.wikipedia.org/wiki/JPEG#Decoding
    let coeffs = [
        -66, -63, -71, -68, -56, -65, -68, -46,
        -71, -73, -72, -46, -20, -41, -66, -57,
        -70, -78, -68, -17,  20, -14, -61, -63,
        -63, -73, -62,  -8,  27, -14, -60, -58,
        -58, -65, -61, -27,  -6, -40, -68, -50,
        -57, -57, -64, -58, -48, -66, -72, -47,
        -53, -46, -61, -74, -65, -63, -62, -45,
        -47, -34, -53, -74, -60, -47, -47, -41,
   ];
   let expected = [
        62,  65,  57,  60,  72,  63,  60,  82,
        57,  55,  56,  82, 108,  87,  62,  71, 
        58,  50,  60, 111, 148, 114,  67,  65,
        65,  55,  66, 120, 155, 114,  68,  70,
        70,  63,  67, 101, 122,  88,  60,  78,
        71,  71,  64,  70,  80,  62,  56,  81,
        75,  82,  67,  54,  63,  65,  66,  83,
        81,  94,  75,  54,  68,  81,  81,  87,
    ];
    levelShift(coeffs);
    testName = "Level shift";
    compareOutput(testName, expected, coeffs);

}

function testReorder() {
    // Example data from https://en.wikipedia.org/wiki/JPEG#Decoding
    let coeffs = [
        -26,
         -3,  0, 
         -3, -2, -6, 
          2, -4,  1, -3,
          1,  1,  5,  1,  2, 
         -1,  1, -1,  2,  0,  0,
          0,  0,  0, -1, -1,  0,  0,
          0,  0,  0,  0,  0,  0,  0,  0,
          0,  0,  0,  0,  0,  0,  0,
          0,  0,  0,  0,  0,  0,
          0,  0,  0,  0,  0,
          0,  0,  0,  0,
          0,  0,  0,
          0,  0,
          0,
    ];
    let expected = [
        -26, -3, -6,  2,  2, -1,  0,  0,
          0, -2, -4,  1,  1,  0,  0,  0,
         -3,  1,  5, -1, -1,  0,  0,  0,
         -3,  1,  2, -1,  0,  0,  0,  0,
          1,  0,  0,  0,  0,  0,  0,  0,
          0,  0,  0,  0,  0,  0,  0,  0,
          0,  0,  0,  0,  0,  0,  0,  0,
          0,  0,  0,  0,  0,  0,  0,  0,
    ];
    let scratch = new Array(coeffs.length);
    reorder(coeffs, scratch);
    testName = "Reordering";
    compareOutput(testName, expected, coeffs);

}


function testDequantize() {
    // Example data from https://en.wikipedia.org/wiki/JPEG#Decoding
    let quantTable = [
        16,  11,  10,  16,  24,  40,  51,  61, 
        12,  12,  14,  19,  26,  58,  60,  55,
        14,  13,  16,  24,  40,  57,  69,  56,
        14,  17,  22,  29,  51,  87,  80,  62,
        18,  22,  37,  56,  68, 109, 103,  77,
        24,  35,  55,  64,  81, 104, 113,  92,
        49,  64,  78,  87, 103, 121, 120, 101,
        72,  92,  95,  98, 112, 100, 103,  99,
    ];
    let coeffs = [
        -26, -3, -6,  2,  2, -1,  0,  0,
          0, -2, -4,  1,  1,  0,  0,  0,
         -3,  1,  5, -1, -1,  0,  0,  0,
         -3,  1,  2, -1,  0,  0,  0,  0,
          1,  0,  0,  0,  0,  0,  0,  0,
          0,  0,  0,  0,  0,  0,  0,  0,
          0,  0,  0,  0,  0,  0,  0,  0,
          0,  0,  0,  0,  0,  0,  0,  0,
    ];
    let expected = [
        -416, -33, -60,  32,  48, -40,   0,   0,
           0, -24, -56,  19,  26,   0,   0,   0,
         -42,  13,  80, -24, -40,   0,   0,   0,
         -42,  17,  44, -29,   0,   0,   0,   0,
          18,   0,   0,   0,   0,   0,   0,   0,
           0,   0,   0,   0,   0,   0,   0,   0,
           0,   0,   0,   0,   0,   0,   0,   0,
           0,   0,   0,   0,   0,   0,   0,   0,
    ];
    dequantize(coeffs, quantTable);
    testName = "Dequantization";
    compareOutput(testName, expected, coeffs);
}

function testIDCT(fn) {
    // Example data from https://en.wikipedia.org/wiki/JPEG#Decoding
    let input = [
        -416, -33, -60,  32,  48, -40,   0,   0,
           0, -24, -56,  19,  26,   0,   0,   0,
         -42,  13,  80, -24, -40,   0,   0,   0,
         -42,  17,  44, -29,   0,   0,   0,   0,
          18,   0,   0,   0,   0,   0,   0,   0,
           0,   0,   0,   0,   0,   0,   0,   0,
           0,   0,   0,   0,   0,   0,   0,   0,
           0,   0,   0,   0,   0,   0,   0,   0,
    ];
    let expected = [
         -66, -63, -71, -68, -56, -65, -68, -46,
         -71, -73, -72, -46, -20, -41, -66, -57,
         -70, -78, -68, -17,  20, -14, -61, -63,
         -63, -73, -62,  -8,  27, -14, -60, -58,
         -58, -65, -61, -27,  -6, -40, -68, -50,
         -57, -57, -64, -58, -48, -66, -72, -47,
         -53, -46, -61, -74, -65, -63, -62, -45,
         -47, -34, -53, -74, -60, -47, -47, -41,
    ];
    let output = fn(input);
    testName = fn.name;
    compareOutput(testName, expected, output);

    // This example was seen in the wild while writing the chen-wang IDCT
    input = new Array(64).fill(0);
    input[0] = 6;   // Not special; could be another small # like 5, 7, 8....
    expected = new Array(64).fill(1);
    output = fn(input);
    compareOutput(testName, expected, output);

    // This example was seen in the wild while writing the chen-wang IDCT
    input = new Array(64).fill(0);
    input[0] = -6;   // Not special; could be another small # like -9, -8, -7....
    expected = new Array(64).fill(-1);
    output = fn(input);
    compareOutput(testName, expected, output);
}

function testHuffmanDecoder(decoder) {
    const bits = [0,0,0,7,1,1,1,1,1,0,0,0,0,0,0,0,0]; // BITS needs to be 1-indexed, so set [0]...
    delete bits[0]; // ... then delete it here. Gross but simplifies things for testing.
    const values = [4, 5, 3, 2, 6, 1, 0, 7, 8, 9, 10, 11];
    const lengths = [3, 3, 3, 3, 3, 3, 3, 4, 5, 6, 7, 8];
    // Binary representation of huffman codes for <values> followed by 5 padding bits in the last byte
    const codeStr = [0b00000101, 0b00111001, 0b01110111, 0b01111011, 0b11101111, 0b11011111, 0b11011111];
    const reader = new DataViewReader(new DataView(new Uint8Array(codeStr).buffer));

    const img = {};     // Dummy mock
    img.scan = {};
    img.scan.dcpred = [];

    let testCnt = 0;
    let errCnt = 0;
    decoder.initDecoder(bits);

    function runInsertTest(level, value, expected) {
        let val = decoder.insertCode(level, value);
        testCnt++;
        if (val != expected) {
            console.error("Test " + testCnt + " Failed (expected " + expected + ", got " + val
                + " while inserting " + value + ")");
            errCnt++;
        }
    }
    
    // Test insertions
    for (let i = 0; i < values.length; i++) {
        runInsertTest(lengths[i], values[i], true);
    }
    // We shouldn't be able to insert an 8th node at L3, 
    // but the HuffTree currently has no way of knowing this
    // since nodes don't know the state of other nodes.
    // For this to be a problem in practice, the JPEG
    // file would have to be out-of-spec/corrupt
    //runInsertTest(3, 12, false);    // Too many nodes in tree

    // Test retrieval
    for (let i = 0; i < values.length; i++) {
        let ret = decoder.decodeHuffman(reader, img);
        testCnt++
        if (ret != values[i]) {
            console.error("Test " + testCnt + " Failed (expected " +  values[i] + ", got " + ret + ")");
            errCnt++;
        }
    }
    console.log(decoder.constructor.name + " tests " + (errCnt === 0 ? "passed!" : " failed with " + errCnt + " failures"));
}


let huffDecoder = new HuffTree();
testHuffmanDecoder(huffDecoder);
huffDecoder = new HuffArray();
testHuffmanDecoder(huffDecoder);
testExtend();
testDequantize();
testReorder();
idctFn = idct;
testIDCT(idct);
idctFn = idctCached;
testIDCT(idctFn);
idctFn = idctChenWang;
testIDCT(idctFn);
testLevelShift();
testYCbCrToRGB();
