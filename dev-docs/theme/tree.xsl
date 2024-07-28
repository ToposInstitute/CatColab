<?xml version="1.0"?>
<!-- SPDX-License-Identifier: CC0-1.0 -->
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:f="http://www.jonmsterling.com/jms-005P.xml">

  <xsl:key name="tree-with-addr" match="/f:tree/f:mainmatter//f:tree" use="f:frontmatter/f:addr/text()" />

  <xsl:template match="/">
    <html>
      <head>
        <meta name="viewport" content="width=device-width" />
        <link rel="stylesheet" href="style.css" />
        <link rel="stylesheet" href="custom.css" />
        <link rel="stylesheet" href="katex.min.css" />
        <script type="text/javascript">
          <xsl:if test="/f:tree/f:frontmatter/f:source-path">
            <xsl:text>window.sourcePath = '</xsl:text>
            <xsl:value-of select="/f:tree/f:frontmatter/f:source-path" />
            <xsl:text>'</xsl:text>
          </xsl:if>
        </script>
        <script type="module" src="forester.js"></script>
        <title>
          <xsl:value-of select="/f:tree/f:frontmatter/f:title[@text]" />
        </title>
      </head>
      <body>
        <ninja-keys placeholder="Start typing a note title or ID"></ninja-keys>
        <xsl:if test="not(/f:tree[@root = 'true'])">
          <header class="header">
            <nav class="nav">
              <div class="logo">
                <a href="index.xml" title="Home">
                  <xsl:text>« Home</xsl:text>
                </a>
              </div>
            </nav>
          </header>
        </xsl:if>
        <div id="grid-wrapper">
          <article>
            <xsl:apply-templates select="f:tree" />
          </article>
          <xsl:if test="f:tree/f:mainmatter/f:tree[not(@toc='false')] and not(/f:tree/f:frontmatter/f:meta[@name = 'toc']/.='false')">
            <nav id="toc">
              <div class="block">
                <h1>Table of Contents</h1>
                <xsl:apply-templates select="f:tree/f:mainmatter" mode="toc" />
              </div>
            </nav>
          </xsl:if>
        </div>
      </body>
    </html>
  </xsl:template>

  <xsl:template match="f:tree" mode="tree-taxon-with-number">
    <xsl:param name="suffix" select="''"/>
    <xsl:param name="taxon" select="f:frontmatter/f:taxon" />
    <xsl:param name="number" select="f:frontmatter/f:number" />
    <xsl:param name="fallback-number"/>
    <xsl:param name="in-backmatter" select="ancestor::f:backmatter"/>

    <xsl:variable name="tree-is-root" select="not(parent::*)" />

    <xsl:variable name="explicitly-unnumbered" select="boolean(ancestor-or-self::f:tree[@numbered='false' or @toc='false'])"/>
    <xsl:variable name="implicitly-unnumbered" select="count(../f:tree) = 1 and not(count(f:mainmatter/f:tree) > 1)"/>

    <xsl:variable name="should-number" select="$number != '' or (not($in-backmatter) and not($tree-is-root) and not($explicitly-unnumbered)) and not($implicitly-unnumbered)"/>

    <xsl:if test="$taxon != ''">
      <xsl:value-of select="$taxon"/>
      <xsl:if test="$should-number or $fallback-number != ''">
        <xsl:text>&#160;</xsl:text>
      </xsl:if>
    </xsl:if>

    <xsl:choose>
      <xsl:when test="$should-number">
        <xsl:choose>
          <xsl:when test="$number != ''">
            <xsl:value-of select="$number"/>
          </xsl:when>
          <xsl:otherwise>
            <xsl:number format="1.1" count="f:tree[ancestor::f:tree and (not(@toc='false' or @numbered='false'))]" level="multiple" />
          </xsl:otherwise>
        </xsl:choose>
      </xsl:when>
      <xsl:when test="$fallback-number != ''">
        <xsl:value-of select="$fallback-number"/>
      </xsl:when>
    </xsl:choose>

    <xsl:if test="$taxon != '' or $fallback-number != '' or $should-number">
      <xsl:value-of select="$suffix"/>
    </xsl:if>
  </xsl:template>

  <xsl:template match="f:tree" mode="toc">
    <li>
      <xsl:for-each select="f:frontmatter">
        <a class="bullet">
          <xsl:choose>
            <xsl:when test="f:addr and f:route">
              <xsl:attribute name="href">
                <xsl:value-of select="f:route" />
              </xsl:attribute>
              <xsl:attribute name="title">
                <xsl:value-of select="f:title[@text]" />
                <xsl:text>&#160;[</xsl:text>
                <xsl:value-of select="f:addr" />
                <xsl:text>]</xsl:text>
              </xsl:attribute>
            </xsl:when>
            <xsl:otherwise>
              <xsl:attribute name="href">
                <xsl:text>#tree-</xsl:text>
                <xsl:value-of select="f:anchor"/>
              </xsl:attribute>
              <xsl:attribute name="title">
                <xsl:value-of select="f:title" />
              </xsl:attribute>
            </xsl:otherwise>
          </xsl:choose>
          <xsl:text>■</xsl:text>
        </a>
        <span class="link local" data-target="#tree-{f:anchor}">
          <span class="taxon">
            <xsl:apply-templates select=".." mode="tree-taxon-with-number">
              <xsl:with-param name="suffix">.&#160;</xsl:with-param>
            </xsl:apply-templates>
          </span>

          <xsl:apply-templates select="f:title" />
        </span>
      </xsl:for-each>
      <xsl:apply-templates select="f:mainmatter" mode="toc" />
    </li>
  </xsl:template>

  <xsl:template match="f:mainmatter" mode="toc">
    <ul class="block">
      <xsl:apply-templates select="f:tree[not(@toc='false')]" mode="toc" />
    </ul>
  </xsl:template>

  <xsl:template match="f:frontmatter/f:title">
    <xsl:apply-templates />
  </xsl:template>

  <xsl:template match="f:mainmatter">
    <div class="tree-content">
      <xsl:apply-templates />
    </div>
  </xsl:template>

  <xsl:template match="f:addr">
    <a class="slug" href="{../f:route}">
      <xsl:text>[</xsl:text>
      <xsl:value-of select="." />
      <xsl:text>]</xsl:text>
    </a>
  </xsl:template>

  <xsl:template match="f:source-path">
    <a class="edit-button" href="{concat('vscode://file', .)}">
      <xsl:text>[edit]</xsl:text>
    </a>
  </xsl:template>

  <xsl:template match="f:taxon">
    <xsl:value-of select="." />
  </xsl:template>

  <xsl:template match="f:frontmatter">
    <header>
      <h1>
        <span class="taxon">
          <xsl:apply-templates select=".." mode="tree-taxon-with-number">
            <xsl:with-param name="suffix">.&#160;</xsl:with-param>
          </xsl:apply-templates>
        </span>

        <xsl:apply-templates select="f:title" />
        <xsl:text>&#032;</xsl:text>
        <xsl:apply-templates select="f:addr" />
        <xsl:text>&#032;</xsl:text>
        <xsl:apply-templates select="f:source-path" />
      </h1>
      <div class="metadata">
        <ul>
          <xsl:apply-templates select="f:date" />
          <xsl:if test="not(f:meta[@name = 'author']/.='false')">
            <xsl:apply-templates select="f:authors" />
          </xsl:if>
          <xsl:apply-templates select="f:meta[@name='position']" />
          <xsl:apply-templates select="f:meta[@name='institution']" />
          <xsl:apply-templates select="f:meta[@name='venue']" />
          <xsl:apply-templates select="f:meta[@name='source']" />
          <xsl:apply-templates select="f:meta[@name='doi']" />
          <xsl:apply-templates select="f:meta[@name='orcid']" />
          <xsl:apply-templates select="f:meta[@name='external']" />
          <xsl:apply-templates select="f:meta[@name='slides']" />
          <xsl:apply-templates select="f:meta[@name='video']" />
        </ul>
      </div>
    </header>
  </xsl:template>

  <xsl:template match="f:ref">
    <xsl:variable name="fallback-number">
      <xsl:text>[</xsl:text>
      <xsl:value-of select="@addr"/>
      <xsl:text>]</xsl:text>
    </xsl:variable>

    <xsl:variable name="taxon">
      <xsl:choose>
        <xsl:when test="@taxon">
          <xsl:value-of select="@taxon"/>
        </xsl:when>
        <xsl:otherwise>
          <xsl:text>§</xsl:text>
        </xsl:otherwise>
      </xsl:choose>
    </xsl:variable>

    <a class="link local">
      <xsl:attribute name="href">
        <xsl:choose>
          <xsl:when test="key('tree-with-addr',current()/@addr)">
            <xsl:text>#tree-</xsl:text>
            <xsl:value-of select="key('tree-with-addr',current()/@addr)/f:frontmatter/f:anchor" />
          </xsl:when>
          <xsl:otherwise>
            <xsl:value-of select="@href" />
          </xsl:otherwise>
        </xsl:choose>
      </xsl:attribute>

      <xsl:choose>
        <xsl:when test="key('tree-with-addr', current()/@addr)">
          <xsl:apply-templates select="key('tree-with-addr', current()/@addr)" mode="tree-taxon-with-number">
            <xsl:with-param name="in-backmatter" select="boolean(ancestor::f:backmatter)" />
            <xsl:with-param name="number" select="@number"/>
            <xsl:with-param name="fallback-number" select="$fallback-number"/>
            <xsl:with-param name="taxon" select="$taxon"/>
          </xsl:apply-templates>
        </xsl:when>
        <xsl:otherwise>
          <xsl:value-of select="$taxon"/>
          <xsl:text>&#160;</xsl:text>
          <xsl:choose>
            <xsl:when test="@number">
              <xsl:value-of select="@number"/>
            </xsl:when>
            <xsl:otherwise>
              <xsl:value-of select="$fallback-number"/>
            </xsl:otherwise>
          </xsl:choose>
        </xsl:otherwise>
      </xsl:choose>
    </a>
  </xsl:template>

  <xsl:template match="/f:tree/f:backmatter">
    <footer>
      <xsl:apply-templates />
    </footer>
  </xsl:template>

  <xsl:template match="f:mainmatter//f:backmatter">
  </xsl:template>

  <xsl:template match="f:backmatter//f:backmatter">
  </xsl:template>

  <xsl:template match="f:tree">
    <section>
      <xsl:attribute name="lang">
        <xsl:choose>
          <xsl:when test="f:frontmatter/f:meta[@name='lang']">
            <xsl:value-of select="f:frontmatter/f:meta[@name='lang']" />
          </xsl:when>
          <xsl:otherwise>en</xsl:otherwise>
        </xsl:choose>
      </xsl:attribute>

      <xsl:choose>
        <xsl:when test="@show-metadata = 'false'">
          <xsl:attribute name="class">block hide-metadata</xsl:attribute>
        </xsl:when>
        <xsl:otherwise>
          <xsl:attribute name="class">block</xsl:attribute>
        </xsl:otherwise>
      </xsl:choose>
      <xsl:if test="f:frontmatter/f:taxon">
        <xsl:attribute name="data-taxon">
          <xsl:value-of select="f:frontmatter/f:taxon" />
        </xsl:attribute>
      </xsl:if>

      <xsl:choose>
        <xsl:when test="not(@show-heading='false')">
          <details id="{concat('tree-',f:frontmatter/f:anchor)}">
            <xsl:if test="not(@expanded = 'false')">
              <xsl:attribute name="open">open</xsl:attribute>
            </xsl:if>
            <summary>
              <xsl:apply-templates select="f:frontmatter" />
            </summary>
            <xsl:apply-templates select="f:mainmatter" />
            <xsl:apply-templates select="f:frontmatter/f:meta[@name='bibtex']" />
          </details>
        </xsl:when>
        <xsl:otherwise>
          <xsl:apply-templates select="f:mainmatter" />
        </xsl:otherwise>
      </xsl:choose>
    </section>

    <xsl:apply-templates select="f:backmatter" />
  </xsl:template>

</xsl:stylesheet>
