<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ taglib uri="http://struts.apache.org/tags-html" prefix="html" %>
<%@ taglib uri="http://struts.apache.org/tags-bean" prefix="bean" %>
<%@ taglib uri="http://struts.apache.org/tags-logic" prefix="logic" %>
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<title>Recherche de dossiers</title>
</head>
<body>
<%-- Piège « mise en page en <table> imbriquées » (TRAPS.md) : tableaux de
     mise en page sur plusieurs niveaux, sans role="presentation". Ne pas corriger. --%>
<table width="100%" border="0" cellpadding="4" cellspacing="0">
  <tr>
    <td bgcolor="#336699"><font color="#ffffff"><h1>Recherche de dossiers</h1></font></td>
  </tr>
  <tr>
    <td>
      <table width="100%" border="0" cellpadding="2" cellspacing="0">
        <tr>
          <td>
            <html:errors/>
            <%-- Piège « focus initial » (TRAPS.md) : focus sur Numéro par
                 l'attribut focus, que Struts transforme en JavaScript. --%>
            <html:form action="/rechercher" method="get" focus="number">
              <table border="0" cellpadding="2" cellspacing="0">
                <tr>
                  <td><label for="number">Numéro</label></td>
                  <td><html:text property="number" styleId="number" size="10"/></td>
                </tr>
                <tr>
                  <td><label for="applicant">Demandeur</label></td>
                  <td><html:text property="applicant" styleId="applicant" size="30"/></td>
                </tr>
                <tr>
                  <td><label for="status">Statut</label></td>
                  <td>
                    <html:select property="status" styleId="status">
                      <html:option value="">Tous</html:option>
                      <html:option value="BROUILLON">Brouillon</html:option>
                      <html:option value="EN_INSTRUCTION">En instruction</html:option>
                      <html:option value="REMIS">Remis</html:option>
                    </html:select>
                  </td>
                </tr>
                <tr>
                  <td><label for="filedFrom">Déposé du</label></td>
                  <td><html:text property="filedFrom" styleId="filedFrom" size="10"/></td>
                </tr>
                <tr>
                  <td><label for="filedTo">Déposé au</label></td>
                  <td><html:text property="filedTo" styleId="filedTo" size="10"/></td>
                </tr>
                <tr>
                  <td>&nbsp;</td>
                  <td><html:submit value="Rechercher"/></td>
                </tr>
              </table>
            </html:form>
          </td>
        </tr>
        <logic:present name="results">
        <tr>
          <td>
            <logic:empty name="results">
              <p>Aucun dossier ne correspond à vos critères.</p>
            </logic:empty>
            <logic:notEmpty name="results">
              <table border="1" cellpadding="3" cellspacing="0">
                <tr>
                  <th>Numéro</th>
                  <th>Demandeur</th>
                  <th>Objet</th>
                  <th>Statut</th>
                  <th>Déposé le</th>
                </tr>
                <logic:iterate id="row" name="results">
                <tr>
                  <td><html:link action="/fiche" paramId="number" paramName="row" paramProperty="number"><bean:write name="row" property="number"/></html:link></td>
                  <%-- Piège XSS (TRAPS.md) : filter="false" n'échappe pas le demandeur. Ne pas corriger. --%>
                  <td><bean:write name="row" property="applicant" filter="false"/></td>
                  <td><bean:write name="row" property="subject"/></td>
                  <td><bean:write name="row" property="statusLabel"/></td>
                  <td><bean:write name="row" property="filedOn"/></td>
                </tr>
                </logic:iterate>
              </table>
            </logic:notEmpty>
          </td>
        </tr>
        </logic:present>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
