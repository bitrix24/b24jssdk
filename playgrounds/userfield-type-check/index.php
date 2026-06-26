<?php
/**
 * Bitrix24-hosted local app handler (#269 check).
 *
 * This is a CLIENT-SIDE app: it does no server-side REST. It just serves the
 * single-page app, which runs in the Bitrix24 iframe and talks to the REST API
 * in the application's OAuth context via the b24jssdk UMD build (B24Frame).
 *
 * Bitrix24 hosting executes PHP, so a `.php` entry is the safe handler. If you
 * host the files on a static server instead, point the handler at `index.html`.
 */
header('Content-Type: text/html; charset=utf-8');
readfile(__DIR__ . '/index.html');
