<?xml version="1.0"?>
<!-- SPDX-License-Identifier: CC0-1.0 -->
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:f="http://www.jonmsterling.com/jms-005P.xml"
  xmlns:mml="http://www.w3.org/1998/Math/MathML"
  xmlns:html="http://www.w3.org/1999/xhtml">

  <!-- The following ensures that node not matched by a template will show up as an error. -->
  <xsl:template match="node()|@*">
    <xsl:copy>
      <span style="background-color:red">
        <xsl:text>[</xsl:text>
        <xsl:value-of select="name(.)" />
        <xsl:text>]</xsl:text>
      </span>
      <span style="background-color:red">
        <xsl:apply-templates select="node()|@*" />
      </span>
    </xsl:copy>
  </xsl:template>

  <!-- HTML and MathML nodes should be copied with namespace prefixes stripped.-->
  <xsl:template match="html:*">
    <xsl:element namespace="http://www.w3.org/1999/xhtml" name="{local-name()}">
      <xsl:apply-templates select="@* | node()" />
    </xsl:element>
  </xsl:template>

  <xsl:template match="mml:*">
    <xsl:element namespace="http://www.w3.org/1998/Math/MathML" name="{local-name()}">
      <xsl:apply-templates select="@* | node()" />
    </xsl:element>
  </xsl:template>


  <xsl:template match="f:figure">
    <figure>
      <xsl:apply-templates />
    </figure>
  </xsl:template>

  <xsl:template match="f:figcaption">
   <figcaption>
     <xsl:apply-templates />
   </figcaption>
 </xsl:template>

  <xsl:template match="f:p">
    <p>
      <xsl:apply-templates />
    </p>
  </xsl:template>

  <xsl:template match="f:code">
    <code>
      <xsl:apply-templates />
    </code>
  </xsl:template>

  <xsl:template match="f:pre">
    <pre>
      <xsl:apply-templates />
    </pre>
  </xsl:template>

  <xsl:template match="f:em">
    <em>
      <xsl:apply-templates />
    </em>
  </xsl:template>

  <xsl:template match="f:strong">
    <strong>
      <xsl:apply-templates />
    </strong>
  </xsl:template>

  <xsl:template match="f:ol">
    <ol>
      <xsl:apply-templates />
    </ol>
  </xsl:template>

  <xsl:template match="f:ul">
    <ul>
      <xsl:apply-templates />
    </ul>
  </xsl:template>

  <xsl:template match="f:li">
    <li>
      <xsl:apply-templates />
    </li>
  </xsl:template>

  <xsl:template match="f:blockquote">
    <blockquote>
      <xsl:apply-templates />
    </blockquote>
  </xsl:template>


  <xsl:template match="f:embedded-tex">
    <img src="resources/{@hash}.svg" />
  </xsl:template>

  <xsl:template match="f:error | f:info">
    <span class="error">
      <xsl:apply-templates />
    </span>
  </xsl:template>

  <xsl:template match="f:info">
   <span class="info">
    <xsl:apply-templates />
   </span>
  </xsl:template>



  <xsl:template match="f:tex[@display='block']">
    <xsl:text>\[</xsl:text>
    <xsl:value-of select="." />
    <xsl:text>\]</xsl:text>
  </xsl:template>

  <xsl:template match="f:tex[not(@display='block')]">
    <xsl:text>\(</xsl:text>
    <xsl:value-of select="." />
    <xsl:text>\)</xsl:text>
  </xsl:template>

</xsl:stylesheet>
