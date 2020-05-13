# jsjpeg
Baseline sequential JPEG/JFIF decoder written in Javascript (ES7). Displays the final image 
as well as intermediate images for each component (YCbCr). Includes 2 implementations 
of Huffman decoding: a binary tree-based decoder and an implementation of the array-based 
decoder described in the JPEG spec.

This was built as an exercise, but contributions are welcome.

## To use
Open index.html in a browser, select the desired options, then load an image.

## Building
No build system, just edit + load index.html in a browser

## Testing
For simplicity, tests run automatically on page load rather than via a separate test harness. 
Test output goes to the console.

## Limitations
* Performance is slow for large images; the bulk of the time is spent in the
Inverse Discrete Cosine Transform (IDCT), which is not optimized.
* Decoding large JPEGs will use a lot of memory.
* Does not decode EXIF or other image metadata
* The output image is not cropped to the image (frame) dimensions defined in the file; instead the output image is drawn to the 8px boundaries of a data block, which might be slightly larger than the output image. This manifests as 'streaking' on the right + bottom edges of the output image.

## License
MIT License
