<?xml version="1.0"?>
<!-- SPDX-License-Identifier: CC0-1.0 -->
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:f="http://www.jonmsterling.com/jms-005P.xml">

  <xsl:template match="f:month[.='1']">
    <xsl:text>January</xsl:text>
  </xsl:template>

  <xsl:template match="f:month[.='2']">
    <xsl:text>February</xsl:text>
  </xsl:template>

  <xsl:template match="f:month[.='3']">
    <xsl:text>March</xsl:text>
  </xsl:template>

  <xsl:template match="f:month[.='4']">
    <xsl:text>April</xsl:text>
  </xsl:template>

  <xsl:template match="f:month[.='5']">
    <xsl:text>May</xsl:text>
  </xsl:template>

  <xsl:template match="f:month[.='6']">
    <xsl:text>June</xsl:text>
  </xsl:template>

  <xsl:template match="f:month[.='7']">
    <xsl:text>July</xsl:text>
  </xsl:template>

  <xsl:template match="f:month[.='8']">
    <xsl:text>August</xsl:text>
  </xsl:template>

  <xsl:template match="f:month[.='9']">
    <xsl:text>September</xsl:text>
  </xsl:template>

  <xsl:template match="f:month[.='10']">
    <xsl:text>October</xsl:text>
  </xsl:template>

  <xsl:template match="f:month[.='11']">
    <xsl:text>November</xsl:text>
  </xsl:template>

  <xsl:template match="f:month[.='12']">
    <xsl:text>December</xsl:text>
  </xsl:template>

  <xsl:template match="f:year">
    <xsl:apply-templates />
  </xsl:template>

  <xsl:template match="f:day">
    <xsl:apply-templates />
  </xsl:template>

  <xsl:template match="f:date" mode="date-inner">
    <xsl:apply-templates select="f:month" />
    <xsl:if test="f:day">
      <xsl:text>&#160;</xsl:text>
      <xsl:apply-templates select="f:day" />
    </xsl:if>
    <xsl:if test="f:month">
      <xsl:text>,&#160;</xsl:text>
    </xsl:if>
    <xsl:apply-templates select="f:year" />
  </xsl:template>

  <xsl:template match="f:date[@href]">
    <li class="meta-item">
      <a class="link local" href="{@href}">
        <xsl:apply-templates select="." mode="date-inner" />
      </a>
    </li>
  </xsl:template>

  <xsl:template match="f:date[not(@href)]">
    <li class="meta-item">
      <xsl:apply-templates select="." mode="date-inner" />
    </li>
  </xsl:template>

  <xsl:template match="f:authors">
    <xsl:if test="f:author or f:contributor">
      <li class="meta-item">
        <address class="author">
          <xsl:for-each select="f:author">
            <xsl:apply-templates />
            <xsl:if test="position()!=last()">
              <xsl:text>, &#x20;</xsl:text>
            </xsl:if>
          </xsl:for-each>
          <xsl:if test="f:contributor">
            <xsl:text>&#x20;with contributions from&#x20;</xsl:text>
            <xsl:for-each select="f:contributor">
              <xsl:apply-templates />
              <xsl:if test="position()!=last()">
                <xsl:text>,&#x20;</xsl:text>
              </xsl:if>
            </xsl:for-each>
          </xsl:if>
        </address>
      </li>
    </xsl:if>
  </xsl:template>

  <xsl:template match="f:meta[@name='doi']">
    <li class="meta-item">
      <a class="doi link" href="{concat('https://www.doi.org/', .)}">
        <xsl:value-of select="." />
      </a>
    </li>
  </xsl:template>

  <xsl:template match="f:meta[@name='arxiv']">
    <li class="meta-item">
      <a class="doi link" href="{concat('https://arxiv.org/abs/', .)}">
        <xsl:value-of select="concat('arXiv:', .)" />
      </a>
    </li>
  </xsl:template>

  <xsl:template match="f:meta[@name='orcid']">
    <li class="meta-item">
      <a class="orcid" href="{concat('https://orcid.org/', .)}">
        <xsl:value-of select="." />
      </a>
    </li>
  </xsl:template>

  <xsl:template match="f:meta[@name='bibtex']">
    <pre>
      <xsl:value-of select="." />
    </pre>
  </xsl:template>

  <xsl:template match="f:meta[@name='venue']|f:meta[@name='position']|f:meta[@name='institution']|f:meta[@name='source']">
    <li class="meta-item">
      <xsl:apply-templates />
    </li>
  </xsl:template>

  <xsl:template match="f:meta[@name='external']">
    <li class="meta-item">
      <a class="link external" href="{.}">
        <xsl:value-of select="." />
      </a>
    </li>
  </xsl:template>

  <xsl:template match="f:meta[@name='slides']">
    <li class="meta-item">
      <a class="link external" href="{.}">
        <xsl:text>Slides</xsl:text>
      </a>
    </li>
  </xsl:template>

  <xsl:template match="f:meta[@name='video']">
    <li class="meta-item">
      <a class="link external" href="{.}">
        <xsl:text>Video</xsl:text>
      </a>
    </li>
  </xsl:template>

</xsl:stylesheet>
