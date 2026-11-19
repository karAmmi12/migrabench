<%@ page contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" %>
<%@ taglib uri="http://struts.apache.org/tags-html" prefix="html" %>
<%@ taglib uri="http://struts.apache.org/tags-bean" prefix="bean" %>
<%@ taglib uri="http://struts.apache.org/tags-logic" prefix="logic" %>
<bean:define id="sheet" name="sheet" type="fr.migrabench.legacy.web.DossierSheet"/>
<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<title>Remise du dossier</title>
</head>
<body>
<%-- Piège « mise en page en <table> imbriquées » (TRAPS.md) : tableaux de
     mise en page sur plusieurs niveaux, sans role="presentation". Ne pas corriger. --%>
<table width="100%" border="0" cellpadding="4" cellspacing="0">
  <tr>
    <td bgcolor="#336699"><font color="#ffffff"><h1>Remise du dossier</h1></font></td>
  </tr>
  <tr>
    <td>
      <table width="100%" border="0" cellpadding="2" cellspacing="0">
        <tr>
          <td>
            <%-- Récapitulatif en lecture seule. --%>
            <table border="0" cellpadding="2" cellspacing="0">
              <tr>
                <td>Numéro</td>
                <td><bean:write name="sheet" property="number"/></td>
              </tr>
              <tr>
                <td>Demandeur</td>
                <td><bean:write name="sheet" property="applicant"/></td>
              </tr>
              <tr>
                <td>Objet</td>
                <td><bean:write name="sheet" property="subject"/></td>
              </tr>
              <tr>
                <td>Statut</td>
                <td><bean:write name="sheet" property="statusLabel"/></td>
              </tr>
              <tr>
                <td>Déposé le</td>
                <td><bean:write name="sheet" property="filedOn"/></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td>
<logic:equal name="sheet" property="status" value="EN_INSTRUCTION">
<%-- Piège « contrôle de rôle dans la vue » (TRAPS.md) : seul ce scriptlet
     affiche ou masque le bouton. RemiseAction ne vérifie aucun rôle.
     Ne pas corriger. --%>
<% if (request.isUserInRole("instructeur")) { %>
            <html:form action="/remettre" method="post">
              <html:hidden property="number"/>
              <html:submit value="Remettre"/>
            </html:form>
<% } else { %>
            <p>Remise réservée aux instructeurs</p>
<% } %>
</logic:equal>
<logic:equal name="sheet" property="status" value="REMIS">
            <p>Dossier remis le <bean:write name="sheet" property="submittedOn"/></p>
</logic:equal>
<logic:equal name="sheet" property="status" value="BROUILLON">
            <p>Ce dossier ne peut pas être remis</p>
</logic:equal>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
