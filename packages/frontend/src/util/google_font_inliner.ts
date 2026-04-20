// MIT License
//
// Copyright (c) 2019 Todd Ohanian
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//
class GoogleFontInliner {
    private fontUrl: string;
    private text: string;

    constructor(fontFamily: string, text = "") {
        this.fontUrl = `https://fonts.googleapis.com/css?family=${fontFamily}`;
        this.text = text;
    }

    fetchCss(): Promise<string> {
        return fetch(`${this.fontUrl}${this.text && `&text=${encodeURIComponent(this.text)}`}`)
            .then((response) => {
                return response.text();
            })
            .catch((error) => {
                throw error;
            });
    }

    style(): Promise<string> {
        return this.fetchCss().then((css) => {
            const fontEndpoints = css.match(/https:\/\/[^)]+/g);

            if (!fontEndpoints) {
                return css;
            }

            // Promises that resolve as blobs of fonts
            const fontLoadedPromises = fontEndpoints.map((fontEndpoint) => {
                return new Promise<[string, string]>((resolve, reject) => {
                    fetch(fontEndpoint)
                        .then((response) => {
                            return response.blob();
                        })
                        .then((blob) => {
                            const reader = new FileReader();
                            reader.addEventListener("load", function () {
                                // Side Effect
                                const result = this.result as string;
                                css = css.replace(fontEndpoint, result);
                                resolve([fontEndpoint, result]);
                            });
                            reader.readAsDataURL(blob);
                        })
                        .catch(reject);
                });
            });

            return Promise.all(fontLoadedPromises).then(() => {
                return css;
            });
        });
    }
}

export default GoogleFontInliner;
