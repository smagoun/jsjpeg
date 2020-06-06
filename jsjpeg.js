/**
 * Decode a JPEG image into an HTML Canvas
 * 
 * Rough algorithm from the JPEG spec:
 * 
 *     while (no_eoi_marker) {
 *       while (no_sos_marker) {
 *           interpret_markers()
 *       }
 *       decode_scan() {
 *           interpret_header()
 *           while (more_intervals) {
 *               decode_restart_interval() {
 *                   reset_decoder()
 *                   while (more_mcus) {
 *                       decode_mcu() {
 *                           foreach(dataunit) {
 *                               decode_data_unit() {
 *                                   // A DU is an 8x8 block of samples
 *                                   decode_dc_coeff()
 *                                   decode_ac_coeff()
 *                                   dequantize()
 *                                   idct()
 *                               }
 *                           }
 *                       }
 *                   }
 *                   find_next_marker()
 *               }
 *           }
 *       }
 *   }
 */


const ZIGZAG = [
    0, 1, 5, 6, 14, 15, 27, 28,
    2, 4, 7, 13, 16, 26, 29, 42,
    3, 8, 12, 17, 25, 30, 41, 43,
    9, 11, 18, 24, 31, 40, 44, 53,
    10, 19, 23, 32, 39, 45, 52, 54,
    20, 22, 33, 38, 46, 51, 55, 60, 
    21, 34, 37, 47, 50, 56, 59, 61, 
    35, 36, 48, 49, 57, 58, 62, 63
];

const QUANT_TABLE_SIZE = 64;
let quantTables = [
    new Array(QUANT_TABLE_SIZE),
    new Array(QUANT_TABLE_SIZE),
    new Array(QUANT_TABLE_SIZE),
    new Array(QUANT_TABLE_SIZE),
];

const NUM_HUFFMAN_LENGTHS = 16;

const DATA_UNIT_SIZE = 8;

let img = {};

/**
 * Returns the high 4 bits of the byte
 * 
 * @param {*} byte 
 */
function getHighNibble(byte) {
    return byte >> 4;
}
/**
 * Returns the low 4 bits of the byte
 * 
 * @param {*} byte 
 */
function getLowNibble(byte) {
    return byte & 0x0F;
}


/**
 * Generate lookup table for marker codes (Table B.1)
 */
function createMarkerCodeTable() {
    // Code assignments
    codes = new Map([
        // SOF markers, non-differential, Huffman-coding 
        [0xC0, "SOF0"],     // Baseline DCT
        [0xC1, "SOF1"],     // Extended sequential DCT
        [0xC2, "SOF2"],     // Progressive DCT
        [0xC3, "SOF3"],     // Lossless (sequential)
        // SOF markers, differential, Huffman-coding
        [0xC5, "SOF5"],     // Differential sequenctial DCT
        [0xC6, "SOF6"],     // Differential progressive DCT
        [0xC7, "SOF7"],     // Differential lossless (sequential)
        // SOF markers, non-differential, arithmetic coding
        [0xC8, "JPG"],      // (Reserved)
        [0xC9, "SOF9"],     // Extended sequential DCT
        [0xCA, "SOF10"],    // Progressive DCT
        [0xCB, "SOF11"],    // Lossless (sequential)
        // SOF markers, differential, arithmetic coding
        [0xCD, "SOF13"],    // Differential sequential DCT
        [0xCE, "SOF14"],    // Differential progressive DCT
        [0xCF, "SOF15"],    // Differential lossless (sequential)
        // Huffman table spec
        [0xC4, "DHT"],     // Define Huffman table(s)
        // Arithmetic coding conditioning spec
        [0xCC, "DAC"],     // Define arithmetic coding conditioning(s)
        // Other markers
        [0xD8, "SOI*"],     // Start of image
        [0xD9, "EOI*"],     // End of image
        [0xDA, "SOS"],      // Start of sequence
        [0xDB, "DQT"],      // Define quantization table
        [0xDC, "DNL"],      // Define number of lines
        [0xDD, "DRI"],      // Define restart interval
        [0xDE, "DHP"],      // Define hierarchical progression
        [0xDF, "EXP"],      // Expand reference component(s)
        [0xFE, "COM"],      // Comment
        // Reserved markers
        [0x01, "TEM*"],     // For temp private in arithmetic coding
    ]);
    // Restart interval termination
    for (let i = 0; i < 8; i++) {
        codes.set(0xD0 + i, "RST" + i); // Restart with modulo 8 count 'm'
    }
    // Reserved for application segmentation
    for (let i = 0; i <= 0xF; i++) {
        codes.set(0xE0 + i, "APP" + i.toString(16).toUpperCase());
    }
    // Reserved for JPEG extensions
    for (let i = 0; i <= 0xD; i++) {
        codes.set(0xF0 + i, "JPG" + i.toString(16).toUpperCase());
    }
    // Reserved
    for (let i = 2; i <= 0xBF; i++) {
        codes.set(0x00 + i, "RES");
    }
    return codes;
}

/**
 * Entry point. Reads the specified file and passes it to the parser.
 * 
 * @param {File} fileSpec 
 */
function readFile(fileSpec) {
    let reader = new FileReader();
    reader.onload = function (evt) {
        let result = evt.target.result;
        parseFile(result);
    };
    reader.onerror = function (evt) {
        alert("error: " + evt);
    }
    reader.readAsArrayBuffer(fileSpec);
}


/**
 * 
 * 
 * @param {ArrayBuffer} data 
 */
function parseFile(data) {
    let codes = createMarkerCodeTable();
    let reader = new DataViewReader(new DataView(data));
    let seenSOI = false;
    let seenSOF = false;
    let seeingJunk = false;
    while (reader.hasMoreBytes()) {
        // Look for markers / parameters
        let byte = reader.nextByte();
        if (byte != 0xFF) {
            if (!seeingJunk) {
                console.log(reader.currentIndex() + " Found junk byte(s) starting at: " + reader.currentIndex());
                seeingJunk = true;
            }
            continue;   // Junk
        } else if (seeingJunk) {
            console.log(reader.currentIndex() + " Last junk byte was at " + (reader.currentIndex() - 1));
            seeingJunk = false;
        }
        if (!reader.hasMoreBytes()) {
            console.log("Unexpected EOF");
        }
        byte = reader.nextByte();
        let marker = codes.get(byte);
        if (marker === undefined) {
            console.log(reader.currentIndex() + ": Couldn't find marker for " + byte);
            continue;
        }
        console.log(reader.currentIndex() + ": Found " + marker + " for " + byte);
        if (marker === "SOI*") {
            // We should ignore everything before we see an SOI
            seenSOI = true;
            img.restartInterval = 0;
            continue;
        } else if (seenSOI === false) {
            console.log("Error: Missing SOI");
            break;
        }
        // Tables / Misc
        if (marker === "DHT") {
            parseHuffmanTable(marker, reader, img);
        } else if (marker === "DAC") {
            // Arithmetic coding not supported
            parseUnsupportedSegment(marker, reader);
        } else if (marker === "DQT") {
            parseQuantizationTable(marker, reader, img);
        } else if (marker === "DRI") {
            parseRestartInterval(marker, reader, img);
        } else if (marker === "COM") {
            parseUnsupportedSegment(marker, reader);
        } else if (marker.startsWith("APP")) {
            // Look for JFIF
            parseAppSegment(marker, reader);
        }

        // Interpret frame data
        else if (marker === "SOF0") {
            seenSOF = true;
            decodeFrame(marker, reader, img);
        } else if (marker.startsWith("RST")) {
            // TODO: Need to parse this! (We shouldn't come across an RST in this code
            // path; it should be found + consumed during processing of a scan)
            parseUnsupportedSegment(marker, reader);
        } else if (marker === "EOI*") {
            console.log("Found EOI marker. Bye!");
            break;
        } else if (marker === "SOS") {
            img.scan = parseStartOfSequence(marker, reader);
            decodeScan(marker, reader, img, img.scan);
        } else if (marker === "DNL") {
            parseDNL(reader, img);
        } else if (marker === "DHP") {
            // DHP only used in hierarchical images
            parseUnsupportedSegment(marker, reader);
        } else if (marker === "EXP") {
            // EXP not supported; assume all components are fullsize
            parseUnsupportedSegment(marker, reader);
        }
        
        // Misc stuff we ignore
        else if (marker.startsWith("RES")) {
            parseUnsupportedSegment(marker, reader);
        } else if (marker.startsWith("SOC")) {
            // Only baseline profile is supported
            parseUnsupportedSegment(marker, reader);
        } else if (marker.startsWith("JPG")) {
            parseUnsupportedSegment(marker, reader);
        } else if (marker === "TEM*") {
            parseUnsupportedSegment(marker, reader);
        } else {
            console.log(marker + " segment not handled yet");
        }
    }
}


/**
 * Process an segment we don't support. Effectively a NOOP for now.
 * 
 * @param {String} marker Name of the segment
 * @param {DataViewReader} reader 
 */
function parseUnsupportedSegment(marker, reader) {
    let length = reader.nextWord();
    console.log("   Length of " + marker + " segment: " + length);
    // Nothing to do, skip the segment
    reader.skip(length - 2);    // Length includes the 2 bytes that describe length
}

/**
 * Decode a frame of the image
 * 
 * @param {String} marker Name of the segment
 * @param {DataViewReader} reader 
 */
function decodeFrame(marker, reader, img) {
    let length = reader.nextWord();
    console.log("   Length of " + marker + " segment: " + length);

    let precision = reader.nextByte();
    let frameY = reader.nextWord();
    let frameX = reader.nextWord();
    let numComponents = reader.nextByte();
    let components = [];
    for (let i = 0; i < numComponents; i++) {
        let component = {};
        component.componentID = reader.nextByte();   // Component ID (0-255)
        let tmp = reader.nextByte();
        component.hSampleFactor = getHighNibble(tmp);  // H sampling factor (1-4)
        component.vSampleFactor = getLowNibble(tmp);   // V sampling factor (1-4)
        component.quantTableID = reader.nextByte();   // quant table to use (0-3)
        components[i] = component;
    }
    frame = {};
    frame.precision = precision;
    frame.frameY = frameY;
    frame.frameX = frameX;
    frame.numComponents = numComponents;
    frame.components = components;
    img.frame = frame;
    console.log("precision: " + precision + ", frameY: " + frameY + ", frameX: " + frameX
                + ", #components: " + numComponents);
    for (let i = 0; i < numComponents; i++) {
        console.log("    Component[" + i + "]: (id, H, V, Tq) " + components[i])
    }

    // Figure out component dimensions (A.1.1)
    let hmax = 0;   // Max H sampling factor across all components
    let vmax = 0;   // Max V sampling factor across all components
    for (component of components) {
        hmax = Math.max(hmax, component.hSampleFactor);
        vmax = Math.max(vmax, component.vSampleFactor);
    }
    // Calculate # of horizontal + vertical MCUs in the image
    frame.hMCUs = Math.ceil(frame.frameX / DATA_UNIT_SIZE / hmax);
    frame.vMCUS = Math.ceil(frame.frameY / DATA_UNIT_SIZE / vmax);
    
    // Calculate size in pixels of output buffer (which may be bigger than the image)
    frame.outputX = frame.hMCUs * hmax * DATA_UNIT_SIZE;
    frame.outputY = frame.vMCUS * vmax * DATA_UNIT_SIZE;

    // Calculate component dimensions (x,y)
    for (component of components) {
        component.hSize = Math.ceil(frame.outputX * (component.hSampleFactor / hmax)); // size in X
        component.vSize = Math.ceil(frame.outputY * (component.vSampleFactor / vmax)); // size in Y
        console.log("    Component[" + component.componentID + "] size: "
            + component.hSize + "x" + component.vSize);
    }

    // Set up output buffers for each component
    for (component of components) {
        // TODO: Make this a UInt8 array?
        component.imgBuff = new Array(component.hSize * component.vSize).fill(0); // component x * y
        component.outputBuff = new Array(frame.frameX, frame.frameY).fill(0);   // Image size
    }
}


/**
 * Parse Start of Sequence (scan) marker.
 * 
 * @param {String} marker Name of the segment
 * @param {DataViewReader} reader 
 */
function parseStartOfSequence(marker, reader, img) {
    let length = reader.nextWord();
    console.log("   Length of " + marker + " segment: " + length);

    let numComponents = reader.nextByte();
    let components = [];
    for (let i = 0; i < numComponents; i++) {
        let component = [];
        component[0] = reader.nextByte();  // Scan component selector
        let tmp = reader.nextByte();
        component[1] = getHighNibble(tmp);      // DC entropy coding selector
        component[2] = getLowNibble(tmp);       // AC entropy coding selector
        components[i] = component;
    }
    let ss = reader.nextByte();    // Start of predictor selection
    if (ss != 0) {
        console.error("Expected SS=0, got " + ss + ". Not a sequential DCT scan?");
    }
    let se = reader.nextByte();    // End of predictor selection
    if (se != 63) {
        console.error("Expected SE=63, got " + se + ". Not a sequential DCT scan?");
    }
    let tmp = reader.nextByte();
    let ah = getHighNibble(tmp);        // Successive approx. bit position high
    let al = getLowNibble(tmp);         // Successive approx. bit position low
    console.log("numComponents: " + numComponents + ", ss: " + ss + ", se: " 
        + se + ", ah: " + ah + ", al: " + al);
    for (let i = 0; i < numComponents; i++) {
        console.log("    Component[" + i + "]: (Cs, Td, Ta) " + components[i]);
    }
    let scan = {};
    scan.numComponents = numComponents;
    scan.components = components;
    scan.ss = ss;
    scan.se = se;
    scan.ah = ah;
    scan.al = al;
    return scan;
}

/**
 * Sets the value of a pixel at the given coordinates
 * 
 * @param {*} data Data buffer of image data
 * @param {*} hSize Width of the image in pixels
 * @param {*} x 
 * @param {*} y 
 * @param {*} pixel 
 */
function setPixel(data, hSize, x, y, pixel) {
    let lineStride = hSize * 4;     // Pixel stride is 4
    let xy = (y * lineStride) + (x * 4);
    data[xy    ] = pixel[0];
    data[xy + 1] = pixel[1];
    data[xy + 2] = pixel[2];
    data[xy + 3] = pixel[3];
}

/**
 * Parse Start of Sequence marker
 * 
 * @param {String} marker Name of the segment
 * @param {DataViewReader} reader 
 */
function decodeScan(marker, reader, img, scan) {
    // Scratch space for DC predictor. Indexed by component ID (therefore usually 1-indexed)
    scan.dcpred = [];

    // Chose IDCT function
    let idctType = document.querySelector('input[name="idctType"]:checked').value;
    switch(idctType) {
        case "calculated":  idctFn = idct;          break;
        case "cached":      idctFn = idctCached;    break;
        default:
            console.log(`Warning: unknown IDCT type ${idctType}`);
            idctFn = idct;
    }

    // Order components in order specified by scan selector (B.2.3)
    let components = [];
    for (selector of scan.components) {
        for (imgComponent of img.frame.components) {
            let id = imgComponent.componentID;
            if (id === selector[0]) {
                components.push(imgComponent);
                scan.dcpred[id] = 0;    // Reset DC pred for each component (E.2.4)
                break;
            }
        }
    }
    // Image components in the order specified by the scan selector
    scan.orderedComponents = components;
    
    // Note: data is always interleaved if there is more than 1 component (A.2)
    // Read compressed data; decode it....
    let mcuIndex = 0;
    for (let v = 0; v < img.frame.vMCUS; v++) {
        for (let h = 0; h < img.frame.hMCUs; h++) {
            // console.log("Decoding MCU " + mcuIndex);
            if (img.restartInterval > 0 && mcuIndex > 0 && (mcuIndex % img.restartInterval) === 0) {
                // Look for a restart marker; file is likely corrupt if we don't find one
                let byte = reader.nextByte();
                if (byte != 0xFF) {
                    console.error("Expected 0xFF when looking for restart marker, found "
                        + byte.toString(16));
                }
                byte = reader.nextByte();
                if (byte >= 0xD0 && byte <= 0xD7) {
                    // console.log("Restart marker " + byte.toString(16) + ", resetting decoder");
                } else {
                    console.error("Found unexpected marker when looking for reset: " + byte.toString(16));
                }
                // Found restart marker, so reset decoder (F.2.1.3.1)
                scan.dcpred.fill(0);
                reader.align();     // Align to the next byte
            }
            decodeMCU(reader, img, scan, v, h);
            mcuIndex++;
        }
    }

    // Draw the components at their native size, then scale up to the image's size,
    // then draw the components at the image's size. Finally, convert the components
    // to RGB and draw the combined image to the page.
    for (component of components) {
        drawComponent(component);
        scaleComponent(component);
        drawComponentFullSize(component);
    }
    combineComponents(components);

    document.getElementById("outputhsize").textContent = img.frame.outputX;
    document.getElementById("outputvsize").textContent = img.frame.outputY;
}

/**
 * Convert the 3 YCrCB components to RGB and combine them into a single output image,
 * then draw the image to the output canvas.
 * 
 * @param {*} components List of components 
 */
function combineComponents(components) {
    // Combine images via YCbCr --> YUV conversion
    let canvas = document.getElementById("outputCanvas");
    canvas.setAttribute("width", img.frame.outputX);
    canvas.setAttribute("height", img.frame.outputY);
    let ctx = canvas.getContext("2d");
    let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let data = imgData.data;

    let Y, Cb, Cr;
    let pixel = [0, 0, 0, 0];
    for (let y = 0; y < img.frame.outputY; y++) {
        let srcLineStart = y * img.frame.outputX;
        for (let x = 0; x < img.frame.outputX; x++) {
            if (frame.numComponents === 1) {
                // JFIF grayscale
                Y = components[0].outputBuff[srcLineStart + x];
                pixel = [Y, Y, Y, 255];
            } else if (frame.numComponents === 3) {
                // JFIF YcbCr
                Y = components[0].outputBuff[srcLineStart + x];
                Cb = components[1].outputBuff[srcLineStart + x];
                Cr = components[2].outputBuff[srcLineStart + x];
                YCbCrToRGB(Y, Cb, Cr, pixel);
            } else {
                console.error("Error: Image has " + frame.numComponents + " components; we only support 1 or 3 for JFIF");
            }
            setPixel(data, img.frame.outputX, x, y, pixel);
        }
    }
    ctx.putImageData(imgData, 0, 0);
}

/**
 * Scale the component from its native size to the image's size, placing the output
 * into the component's outputBuff
 * 
 * @param {*} component 
 */
function scaleComponent(component) {
    let hScale = img.frame.outputX / component.hSize;  // Factor to scale component up to output side
    let vScale = img.frame.outputY / component.vSize;  // Factor to scale component up to output side
    for (let sy = 0, dy = 0; sy < component.vSize; sy++, dy+=vScale) {
        let srcLineStart = sy * component.hSize;
        for (let sx = 0, dx = 0; sx < component.hSize; sx++, dx+=hScale) {
            let val = component.imgBuff[srcLineStart + sx];

            for (let y = 0; y < vScale; y++) {
                for (let x = 0; x < hScale; x++) {
                    let destY = dy + y;
                    let destX = dx + x;
                    component.outputBuff[(destY * img.frame.outputX) + destX] = val;
                }
            }
        }
    }
}

/**
 * Draw the component to the page, scaled up to the size of the image
 * 
 * @param {*} component 
 */
function drawComponentFullSize(component) {
    let id = component.componentID;
    let canvas = document.getElementById("component" + id + "ScaledCanvas");
    canvas.setAttribute("width", img.frame.outputX);
    canvas.setAttribute("height", img.frame.outputY);
    let ctx = canvas.getContext("2d");
    let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let data = imgData.data;
    for (let y = 0; y < img.frame.outputY; y++) {
        let srcLineStart = y * img.frame.outputX;
        for (let x = 0; x < img.frame.outputX; x++) {
            let val = component.outputBuff[srcLineStart + x];
            let pixel = [val, val, val, 255];   // 255 for alpha channel
            setPixel(data, img.frame.outputX, x, y, pixel);
        }
    }
    ctx.putImageData(imgData, 0, 0);
}

/**
 * Draw the component to the page at its native size
 * 
 * @param {*} component 
 */
function drawComponent(component) {
    let id = component.componentID;
    let compHSizeStr = document.getElementById("component" + id + "hsize");
    compHSizeStr.textContent = component.hSize;
    let compVSizeStr = document.getElementById("component" + id + "vsize");
    compVSizeStr.textContent = component.vSize;
    
    let canvas = document.getElementById("component" + id + "Canvas");
    canvas.setAttribute("width", component.hSize);
    canvas.setAttribute("height", component.vSize);
    let ctx = canvas.getContext("2d");
    let imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let data = imgData.data;
    for (let y = 0; y < component.vSize; y++) {
        let srcLineStart = y * component.hSize;
        for (let x = 0; x < component.hSize; x++) {
            let val = component.imgBuff[srcLineStart + x];
            let pixel = [val, val, val, 255];   // 255 for alpha channel
            setPixel(data, component.hSize, x, y, pixel);
        }
    }
    ctx.putImageData(imgData, 0, 0);
}

/**
 * Perform YCbCr to RGB colorspace conversion using the algorithm in the JFIF spec.
 * 
 * Writes the RGB values (and sets alpha = 255) into pixel
 * 
 * @param {*} Y 
 * @param {*} Cb 
 * @param {*} Cr 
 * @param {*} pixel 4-element array of RGBA
 */
function YCbCrToRGB(Y, Cb, Cr, pixel) {
    pixel[0] = clamp(Math.round(Y + (1.402 * (Cr - 128))));
    pixel[1] = clamp(Math.round(Y - (0.34414 * (Cb - 128)) - (0.71414 * (Cr - 128))));
    pixel[2] = clamp(Math.round(Y + 1.772 * (Cb - 128)));
    pixel[3] = 255;
}

/**
 * Decode all of the data blocks in the MCU. The MCU contains 1 or more data
 * blocks for each component. The number of data blocks per component is 
 * determined by the horizontal + vertical sampling factors of each component.
 * 
 * See A.2.3 for information about decoding interleaved data units.
 * 
 * @param {DataViewReader} reader Data source
 * @param {*} img Struct with information about the image, including frame + components
 * @param {*} scan 
 * @param {*} vMCU Vertical index of this MCU
 * @param {*} hMCU Horizontal index of this MCU
 */
function decodeMCU(reader, img, scan, vMCU, hMCU) {
    // TODO: rename scan.components vs scan.orderedComponents, it's confusing. Can we
    // just merge into a big 'component' data structure that has both the component
    // info from the frame and the component info from the scan header? Probably
    // breaks for hierachical images, but so what?
    //
    // Also want to bolt on the ZZ tables to Component....time to make a component class?
    for (component of scan.orderedComponents) {
        let id = component.componentID;

        // Find the component metadata in the scan so we can look up huff tables. Ugh so messy
        let dcTableID;
        let acTableID;
        for (sc of scan.components) {
            if (sc[0] === id) {
                dcTableID = sc[1];
                acTableID = sc[2];
                break;
            }
        }
        let dcTable = img.huffmanTables[0][dcTableID];    // 0 is DC table, 1 is AC table: B.2.4.2
        let acTable = img.huffmanTables[1][acTableID];
        let quantTable = img.quantTables[component.quantTableID];
        
        // # of H,V blocks (data units) per MCU in the component
        let h = component.hSampleFactor;
        let v = component.vSampleFactor;
        let block;
        for (let y = 0; y < v; y++) {   // Iterate over blocks in the MCU
            for (let x = 0; x < h; x++) {   // Iterate over blocks in the MCU
                // Block is the decoded image data. Store it in a component
                block = decodeDataUnit(reader, img, scan, id, dcTable, acTable, quantTable);

                // Top-left pixel coordinates of the MCU within the component
                // mcuY: # vert MCUs * v blocks/MCU * block size * line stride of component
                let mcuY = vMCU * v * DATA_UNIT_SIZE * component.hSize;
                // mcuX: mcuY + (# horiz MCUs * h blocks/MCU * block size)
                let mcuX = mcuY + (hMCU * h * DATA_UNIT_SIZE);

                // Top-left coordinates of the block within the MCU
                let topX = x * DATA_UNIT_SIZE;
                let topY = y * DATA_UNIT_SIZE * component.hSize;

                // Copy block contents to component
                for (let yy = 0; yy < DATA_UNIT_SIZE; yy++) {   // yy is local y coordinate in block
                    let blockLineStart = mcuX + topY + topX + (yy * component.hSize);
                    for (let xx = 0; xx < DATA_UNIT_SIZE; xx++) {   // xx is local x coordinate in block
                        let idx = blockLineStart + xx;
                        if (component.imgBuff[idx] != 0) {
                            console.warn("Warning: overwriting imgBuf data: idx=" + idx
                            + ", x=" + x + ", y=" + y + ", h=" + h + ", v=" + v + ", hMCU="
                            + hMCU + ", vMCU=" + vMCU + ", topX=" + topX + ", topY="
                            + topY + ", yy=" + yy + ", xx=" + xx + ", blockLineStart=" + blockLineStart);
                        }
                        component.imgBuff[idx] = block[yy * DATA_UNIT_SIZE + xx];
                    }
                }
            }
        }
    }
}

/**
 * Read and decode the DC coefficient from the bit stream. Side effect is that it loads the 
 * 
 * Returns the DC coefficient
 * 
 * F.2.2.1
 * 
 * @param {DataViewReader} reader Data source
 * @param {*} img Struct containing information about the image
 * @param {*} scan Struct containing information about the scan (specifically the table of DC predictors)
 * @param {*} id ID of the current component. Used to look up the current DC predictor
 * @param {Array} zigzagCoeff 64-element array where we store the AC coefficients
 * @param {*} dcTable Huffman table implementation for DC coefficients
 */
function decodeDCCoeff(reader, img, scan, id, dcTable) {
    let t = dcTable.decodeHuffman(reader, img);
    let diff = receive(reader, img, t);
    diff = extend(diff, t);
    let dcpred = scan.dcpred[id];
    // console.log("DC Coeff: val: " + t + ", diff: " + diff + ", pred: " + dcpred);
    return dcpred + diff;
}

/**
 * Read and decode the AC coefficients from the bit stream and load them into
 * the array of zig-zag'ed coefficients
 * 
 * F.2.2.2
 * 
 * @param {DataViewReader} reader Data source
 * @param {*} img Struct containing information about the image
 * @param {Array} zigzagCoeff 64-element array where we store the AC coefficients
 * @param {*} acTable Huffman table implementation for AC coefficients
 */
function decodeACCoeffs(reader, img, zigzagCoeff, acTable) {
    for (let k = 1; k < 64; k++) {
        const rs = acTable.decodeHuffman(reader, img);
        // F.1.2.2
        const ssss = getLowNibble(rs);    // Amplitude of next non-zero coeff in ZZ
        const rrrr = getHighNibble(rs);   // Run length of zero coeffs in ZZ before next non-zero
        if (ssss === 0) {
            if (rrrr === 0xF) {
                // console.log("ZRL");
                k += 15;
                continue;
            } else if (rrrr === 0) {
                // console.log("EOB");
                break;
            } else {
                // Other values undefined for Baseline 
                console.error("Error: unexpected RRRR (expected 0 or 0x0f, got " + rrrr + ")");
            }
        } else {
            k += rrrr;
            // Implements the 'DECODE_ZZ' function from Figure F.14
            // Decode amplitude + sign
            const amp = receive(reader, img, ssss);
            const sign = extend(amp, ssss);
            // console.log("AC[" + k + "]: (" + amp + ", " + sign + ")");
            zigzagCoeff[k] = sign;
        }
    }
}

/**
 * Read and decode a single 8x8 data unit. In order, we:
 * - Decode the DC coefficient
 * - Decode the 63 AC coefficients
 * - Dequantize the 64 coefficients
 * - Convert coefficients from zig-zag order to sequential order
 * - Perform Inverse DCT (IDCT)
 * - Recenter the coefficients
 * 
 * F.2.1.2
 * 
 * @param {DataViewReader} reader Data source
 * @param {*} img Struct with information about the image, including frame + components
 * @param {*} scan Struct with information about this scan
 * @param {*} id ID of the current component. Used to look up the current DC predictor
 * @param {*} dcTable Huffman table to use for decoding DC coefficients
 * @param {*} acTable Huffamn table to use for decoding AC coefficients
 * @param {*} quantTable Quantization table for this block
 */
function decodeDataUnit(reader, img, scan, id, dcTable, acTable, quantTable) {
    // 8x8 table of DC/AC coeffs
    const zigzagCoeff = new Array(64).fill(0);

    // Decode DC Coeff for 8x8 block using DC table dest in scan header (F.2.2.1)
    zigzagCoeff[0] = decodeDCCoeff(reader, img, scan, id, dcTable);
    scan.dcpred[id] = zigzagCoeff[0];

    // Decode AC coeffs for 8x8 block using AC table dest in scan header (F.2.2.2)
    decodeACCoeffs(reader, img, zigzagCoeff, acTable);

    // Dequantize using table dest in frame header (F.2.1.4)
    // Multiply each coefficient by the corresponding 
    // value in the quant table (which is in ZZ order too)
    dequantize(zigzagCoeff, quantTable);

    // Reorder coefficients (de-zig-zag)
    reordered = reorder(zigzagCoeff);
    // console.log("Reordered:" + reordered);

    // Calculate inverse IDCT on dequantized values (F.2.1.5)
    let block = idctFn(reordered);
    
    // Level-shift (F.2.1.5)
    levelShift(block);
    return block;
}

/**
 * Perform level-shift of coefficients in the block. Operates in-place.
 * 
 * F.2.1.5
 * 
 * @param {*} block 
 */
function levelShift(block) {
    for (let i = 0; i < block.length; i++) {
        block[i] += 128;
    }
}

/**
 * Reorder the coefficients into their natural order (de-zig-zag)
 * 
 * Not clearly specified, but clearly necessary.
 * 
 * Returns a new array of coefficients
 * 
 * @param {*} coeff 
 */
function reorder(coeff) {
    let reordered = new Array(coeff.length);
    for (let i = 0; i < coeff.length; i++) {
        reordered[i] = coeff[ZIGZAG[i]];
    }
    return reordered;
}

/**
 * Dequantize the components in the table using the values from the 
 * given quantization table. Operates in-place.
 * 
 * F.2.1.4
 * 
 * @param {*} zigzagCoeff 
 * @param {*} quantTable 
 */
function dequantize(zigzagCoeff, quantTable) {
    for (let i = 0; i < zigzagCoeff.length; i++) {
        zigzagCoeff[i] = zigzagCoeff[i] * quantTable[i];
    }
}

/**
 * Clamp an integer value to the range [0-255]
 * 
 * @param {*} val 
 */
function clamp(val) {
    return (val > 255 ? 255 : (val < 0 ? 0 : val));
}

/**
 * Implements the EXTEND function to scale the value of a coefficient
 * 
 * F.2.2.1
 * Figure F.12
 * 
 * @param {*} v 
 * @param {*} t 
 */
function extend(v, t) {
    if (t === 0) {
        return 0;
    }
    let vt = 2 ** (t - 1);
    if (v < vt) {
        vt = (-1 << t) + 1;
        v += vt
    }
    return v;
}

/**
 * Implements the RECEIVE function to read a sequence of bits
 * 
 * F.2.2.4
 * 
 * @param {DataViewReader} reader Data source
 * @param {*} img Struct with information about the image, including frame + components
 * @param {*} ssss Number of bits to read
 */
function receive(reader, img, ssss) {
    let v = 0;
    for (let i = 0; i < ssss; i++) {
        v = (v << 1) + reader.nextBit(img);
    }
    return v;
}

/**
 * Parse App segment
 * 
 * @param {String} marker Name of the segment
 * @param {DataViewReader} reader 
 */
function parseAppSegment(marker, reader) {
    let length = reader.nextWord();
    console.log("   Length of " + marker + " segment: " + length);
    
    let tmp = reader.currentIndex();
    if (marker === "APP0") {
        if (length >= 16) {
            let str = "";
            for (let i = 0; i < 5; i++) {
                str += String.fromCharCode(reader.nextByte());
            }
            if (str === "JFIF\0") {
                let major = reader.nextByte();
                let minor = reader.nextByte();
                console.log("JFIF version: " + major + "." + minor);
                let units = reader.nextByte();
                let xdens = reader.nextWord()
                let ydens = reader.nextWord();
                let xthumb = reader.nextByte();
                let ythumb = reader.nextByte();
                let thumbsize = xthumb * ythumb * 3;    // 3 bytes: RGB
                //console.log("thumbnail size: " + xthumb + "x" + ythumb + ", " + thumbsize + " bytes");
                reader.skip(thumbsize);
            }
        }
    } else {
        let content = "";
        for (let i = 0; i < (length - 2); i++) {
            content += String.fromCharCode(reader.nextByte());
        }
        console.log(marker + " content: " + content);
    }
    // TODO: figure out where to set the reader
    return tmp + length - 2;    // Length includes the 2 bytes that describe length
}

/**
 * Parse quantization table
 * 
 * @param {String} marker Name of the segment
 * @param {DataViewReader} reader 
 */
function parseQuantizationTable(marker, reader, img) {
    let length = reader.nextWord()
    //console.log("   Length of " + marker + " segment: " + length);

    // Read a segment
    length = length - 2;
    while (length > 0) {
        let tmp = reader.nextByte();
        let precision = getHighNibble(tmp);
        let destID = getLowNibble(tmp);
        //console.log("byte: " + tmp + ", precision: " + precision + ", destID: " + destID);
        if (precision > 1) {
            console.error("Error: precision not 0 or 1");
        }
        if (destID > 3) {
            console.error("Error: destID not in range 0-3");
        }
        // 8-bit or 16-bit table?
        let tableLength = QUANT_TABLE_SIZE * (precision === 0 ? 1 : 2);
        //console.log("quant table size: " + tableLength);
        if (tableLength > length) {
            console.error("Error: quant table extends past end of " + marker +  " marker segment");
        }
        // Build table
        let table = new Array(QUANT_TABLE_SIZE);
        if (precision === 0) {
            for (let i = 0; i < QUANT_TABLE_SIZE; i++) {
                table[i] = reader.nextByte();
            }
        } else {
            for (let i = 0; i < QUANT_TABLE_SIZE; i++) {
                table[i] = reader.nextWord();
            }
        }
        console.log("setting quant table " + destID + ": " + table);
        quantTables[destID] = table;
        length = length - tableLength - 1;  // -1 for the precision+dest
    }
    img.quantTables = quantTables;
}


/**
 * Parse Huffman table
 * 
 * @param {String} marker Name of the segment
 * @param {DataViewReader} reader 
 */
function parseHuffmanTable(marker, reader, img) {
    let length = reader.nextWord();
    //console.log("   Length of " + marker + " segment: " + length);

    if (img.huffmanTables === undefined) {
        img.huffmanTables = [ [], [] ];    // DC + AC
    }

    // Read a segment
    length = length - 2;
    while (length > 0) {
        let table = {};
        let tmp = reader.nextByte();
        let tableClass = getHighNibble(tmp);
        let destID = getLowNibble(tmp);
        table.class = tableClass;
        //console.log("byte: " + tmp + ", tableClass: " + tableClass + ", destID: " + destID);
        if (tableClass > 1) {
            console.error("Error: tableClass not 0 or 1");
        }
        if (destID > 3) {
            console.error("Error: destID not in range 0-3");
        } else if (destID > 1) {
            console.warn("Warning: code table " + destID + " not supported by baseline decoder")
        }
        // Number of codes of each length (L1, L2, ... Li)
        let bits = [];
        for (let i = 1; i <= NUM_HUFFMAN_LENGTHS; i++) {    // 1-indexed to match JPEG spec
            bits[i] = reader.nextByte();
        }
        console.log("Huffman table class: " + tableClass + ", dest: " + destID + " lengths:" + bits);

        // Read code values for each length (Vi,j) and push them into the Huffman decoder
        let decoderType = document.querySelector('input[name="huffmanType"]:checked').value;
        let huffDecoder = decoderType === "tree" ? new HuffTree() : new HuffArray();
        huffDecoder.initDecoder(bits);
        let numCodes = 0;
        for (let i = 1; i <= NUM_HUFFMAN_LENGTHS; i++) {    // 1-indexed to match JPEG spec
            for (let j = 0; j < bits[i]; j++) {
                let code = reader.nextByte();
                huffDecoder.insertCode(i, code);
                numCodes++;
            }
        }

        let tableLength = NUM_HUFFMAN_LENGTHS + numCodes + 1;   // +1 for the precision+dest
        if (tableLength > length) {
            console.error("Error: huffman table extends past end of " + marker +  " marker segment");
        }

        img.huffmanTables[tableClass][destID] = huffDecoder;
        length = length - tableLength;
    }
}

/**
 * Parse restart interval
 * 
 * @param {String} marker Name of the segment
 * @param {DataViewReader} reader 
 */
function parseRestartInterval(marker, reader, img) {
    let length = reader.nextWord();
    // console.log("   Length of " + marker + " segment: " + length);

    restartInterval = reader.nextWord();
    console.log("Restart interval: " + restartInterval);
    img.restartInterval = restartInterval;
}

/**
 * Parse Define Number of Lines
 * 
 * @param {DataViewReader} reader 
 */
function parseDNL(reader, img) {
    let length = reader.nextWord();
    if (length != 4) {
        console.error("Invalid length for DNL segment (expected 4)");
    }
    // console.log("   Length of " + marker + " segment: " + length);

    let frameY = reader.nextWord();
    console.log("Replacing frame # rows (frameY): old: " + img.frame.frameY + ", new: " + frameY);
    img.frame.frameY = frameY;
    // TODO: Need to redo output image size, and probably other stuff too
}
