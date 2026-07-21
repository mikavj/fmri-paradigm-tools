#!/bin/sh
# Concatenate the source parts into the single deployable page.
# The order matters: p11_load.js wires up the interface and must come after everything
# it refers to, and p99_tail.html closes the script and document.
cd "$(dirname "$0")"
cat p01_head.html p02_body.html p03_core.js p04_model.js p05_read.js p06_write.js \
    p06b_write2.js p07_check.js p08_render.js p09_ui.js p10_convert.js p12_info.js \
    p13_extras.js p11_load.js p99_tail.html > ../ParadigmStudio.html
echo "wrote ../ParadigmStudio.html"
