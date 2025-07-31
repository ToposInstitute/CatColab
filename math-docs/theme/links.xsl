<?xml version="1.0"?>
<!-- SPDX-License-Identifier: CC0-1.0 -->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:f="http://www.forester-notes.org">

  <xsl:template match="text()[ancestor::f:link[1]/@href]">
    <a href="{ancestor::f:link[1]/@href}">
      <xsl:choose>
        <xsl:when test="ancestor::f:link[1]/@display-uri">
          <xsl:attribute name="title">
            <xsl:value-of select="ancestor::f:link[1]/@title" />
            <xsl:text> [</xsl:text>
            <xsl:value-of select="ancestor::f:link[1]/@display-uri" />
            <xsl:text>]</xsl:text>
          </xsl:attribute>
        </xsl:when>
        <xsl:otherwise>
          <xsl:attribute name="title">
            <xsl:value-of select="ancestor::f:link[1]/@title" />
          </xsl:attribute>
        </xsl:otherwise>
      </xsl:choose>
      <xsl:value-of select="."/>
    </a>
  </xsl:template>

  <xsl:template match="f:link">
    <span class="link {@type}">
      <xsl:apply-templates  />
    </span>
  </xsl:template>

</xsl:stylesheet>
