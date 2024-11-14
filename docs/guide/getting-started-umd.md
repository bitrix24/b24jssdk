---
outline: deep
---
# Quick Start for UMD {#getting-started-umd}

This page will help you quickly start using `@bitrix24/b24jssdk` with the UMD version, which is suitable for use in the browser.

## Import {#import}
### Via CDN {#import-cdn}

You can include the library directly via CDN. Add the following `<script>` tag to your HTML file:

```html
<script src="https://unpkg.com/@bitrix24/b24jssdk@latest/dist/umd/index.min.js"></script>
```

### Local Import {#import-local}

Download the UMD version of the library from [www.npmjs.com](<#0 >) and add it to your project.

Then include it in your HTML file:

```html
<script src="/path/to/umd/index.min.js"></script>
```

## Example {#example}

After including the library, it will be available through the global variable `[B24Js]`. Here is an example of how to use it:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bitrix24 Frame Demo</title>
</head>
<body>
<p>See the result in the developer console</p>
<script src="https://unpkg.com/@bitrix24/b24jssdk@latest/dist/umd/index.min.js"></script>
<script>
    document.addEventListener('DOMContentLoaded', async () => {
        try
        {
            let $b24 = await B24Js.initializeB24Frame();
        }
        catch (error)
        {
            console.error(error);
        }
    });
</script>
</body>
</html>
```

## Documentation

For more detailed information on all available functions and parameters, please refer to our documentation for [B24Hook](/reference/hook-index) and [B24Frame](/reference/frame-initialize-b24-frame).

## Support

If you have any questions or issues, you can create an issue on [GitHub](https://github.com/bitrix24/b24jssdk/issues).